import "server-only";
import { load } from "cheerio";
import type {
  ProviderInput,
  RetrievedSource,
  SourceProvider,
} from "./types";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";

type BrandConfig = {
  key: string;
  site: string;
  brandId: number;
  brandNames: string[];
};

const BRAND_CONFIGS: BrandConfig[] = [
  {
    key: "whirlpool",
    site: "https://www.whirlpoolparts.com",
    brandId: 5,
    brandNames: ["whirlpool"],
  },
  {
    key: "maytag",
    site: "https://www.maytagreplacementparts.com",
    brandId: 4,
    brandNames: ["maytag"],
  },
  {
    key: "kitchenaid",
    site: "https://www.kitchenaidparts.com",
    brandId: 121,
    brandNames: ["kitchenaid", "kitchen aid"],
  },
  {
    key: "jennair",
    site: "https://www.jennairreplacementparts.com",
    brandId: 103,
    brandNames: ["jennair", "jenn air", "jenn-air"],
  },
];

const PRODUCT_TYPE_TO_ID: Record<string, number> = {
  refrigerator: 4,
  "range vent hood": 7,
  hood: 7,
  venthood: 7,
  dryer: 8,
  dishwasher: 9,
  "washing machine": 11,
  washer: 11,
  "range/stove/oven": 13,
  range: 13,
  stove: 13,
  oven: 13,
  "washer/dryer combo": 17,
  combo: 17,
  "oven/microwave combo": 18,
  "microwave combo": 18,
};

const COMMON_CATEGORY_NAMES = new Set([
  "Adhesive",
  "Axle, Roller, Shaft, Wheel",
  "Belt",
  "Blower Wheel & Fan Blade",
  "Bracket & Flange",
  "Cap, Lid & Cover",
  "Circuit Board & Timer",
  "Door",
  "Drum & Tub",
  "Duct & Venting",
  "Fastener",
  "Filter",
  "Fuse, Thermal Fuse & Breaker",
  "Gasket & Seal",
  "Handle",
  "Heating Element",
  "Hinge",
  "Hose, Tube & Fitting",
  "Insulation",
  "Knob, Dial & Button",
  "Latch",
  "Leg, Foot & Caster",
  "Lighting & Light Bulb",
  "Manuals, Care Guides & Literature",
  "Miscellaneous",
  "Motor",
  "Paint",
  "Panel",
  "Power Cord",
  "Pulley",
  "Sensor & Thermistor",
  "Spring",
  "Switch",
  "Thermostat",
  "Touchpad",
  "Trim",
  "Tune-Up Maintenance Kit",
  "Valve & Float",
  "Wire, Receptacle & Wire Connector",
  "Wash Arm & Wash Arm Support",
  "Dishrack",
  "Pump",
  "Dispenser",
]);

type ParsedRepairClinicRow = {
  itemId: string;
  title: string;
  description: string;
  manufacturerPartNumber: string;
  nlaStatus: boolean;
  replacementNote: string | null;
};

function normalizeProductType(value: string | null | undefined) {
  const v = cleanText(value).toLowerCase();
  if (!v) return "";
  if (v.includes("washing machine")) return "washing machine";
  if (v.includes("washer")) return "washer";
  if (v.includes("dryer")) return "dryer";
  if (v.includes("dishwasher")) return "dishwasher";
  if (v.includes("refrigerator")) return "refrigerator";
  if (v.includes("range vent hood")) return "range vent hood";
  if (v.includes("hood")) return "hood";
  if (v.includes("range/stove/oven")) return "range/stove/oven";
  if (v.includes("range")) return "range";
  if (v.includes("stove")) return "stove";
  if (v.includes("oven/microwave combo")) return "oven/microwave combo";
  if (v.includes("microwave combo")) return "microwave combo";
  if (v.includes("oven")) return "oven";
  if (v.includes("combo")) return "combo";
  return v;
}

function brandMatches(inputBrand: string | null | undefined, config: BrandConfig) {
  const brand = normalizeBrand(inputBrand);
  if (!brand) return false;
  return config.brandNames.includes(brand);
}

function guessBrandConfig(inputBrand: string | null | undefined) {
  return BRAND_CONFIGS.find((config) => brandMatches(inputBrand, config)) ?? null;
}

function guessProductIds(productType: string | null | undefined) {
  const normalized = normalizeProductType(productType);

  if (normalized && PRODUCT_TYPE_TO_ID[normalized]) {
    return [PRODUCT_TYPE_TO_ID[normalized]];
  }

  return [
    PRODUCT_TYPE_TO_ID["dryer"],
    PRODUCT_TYPE_TO_ID["washing machine"],
    PRODUCT_TYPE_TO_ID["dishwasher"],
    PRODUCT_TYPE_TO_ID["refrigerator"],
    PRODUCT_TYPE_TO_ID["range/stove/oven"],
    PRODUCT_TYPE_TO_ID["range vent hood"],
    PRODUCT_TYPE_TO_ID["washer/dryer combo"],
    PRODUCT_TYPE_TO_ID["oven/microwave combo"],
  ];
}

async function findModelPageUrl(input: {
  site: string;
  brandId: number;
  productId: number;
  model: string;
}): Promise<string | null> {
  const model = normalizeModel(input.model);
  
  // PASS 1: Direct Search (Fast)
  const searchUrl = `${input.site}/PartSearch/Search?searchTerm=${model}`;
  try {
    const html = await fetchHtml(searchUrl);
    const $ = load(html);
    
    // Check if we were redirected directly to a model page
    // (Model pages usually have category links)
    const hasCategories = $("a[href*='/Shop-For-Parts/']").length > 0;
    if (hasCategories) {
      return searchUrl;
    }

    // Check for a 'See All Parts for this Model' link in results
    const resultLink = $(`a[href*='/Shop-For-Parts/'][href*='Model-${model}']`).first();
    if (resultLink.length) {
      return absoluteUrl(input.site, resultLink.attr("href")!);
    }
  } catch (err) {
    console.warn(`[RepairClinic] Direct search failed for ${model}:`, err);
  }

  // PASS 2: All Models list (Fallback - capped at 10 pages for sanity)
  for (let page = 1; page <= 10; page++) {
    const url =
      page === 1
        ? `${input.site}/PartSearch/ProductBrandAllModels?brandId=${input.brandId}&productId=${input.productId}`
        : `${input.site}/PartSearch/ProductBrandAllModels?brandId=${input.brandId}&n=${page}&productId=${input.productId}`;

    const html = await fetchHtml(url);
    const $ = load(html);

    const exact = $("a").filter((_, el) => {
      const text = normalizeModel($(el).text());
      return text.endsWith(model);
    }).first();

    if (exact.length) {
      return absoluteUrl(input.site, exact.attr("href")!);
    }

    const hasNext = $(`a:contains('${page + 1}')`).length > 0 || $("a:contains('>>')").length > 0;
    if (!hasNext) break;
  }

  return null;
}

function parseCategoryLinks(input: {
  site: string;
  modelPageUrl: string;
  html: string;
  model: string;
}) {
  const $ = load(input.html);

  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href || !text) return null;
      if (!COMMON_CATEGORY_NAMES.has(text)) return null;
      if (!href.includes("/Shop-For-Parts/")) return null;
      if (!href.includes(`Model-${input.model}`)) return null;

      return {
        sectionName: text,
        url: absoluteUrl(input.site, href),
      };
    })
    .get()
    .filter(Boolean) as Array<{ sectionName: string; url: string }>;

  return uniqueBy(links, (item) => item.url);
}

function parsePaginationLinks(site: string, html: string, currentUrl: string) {
  const $ = load(html);
  const current = new URL(currentUrl);

  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href || !text) return null;
      if (!/^\d+$/.test(text) && text !== ">>") return null;

      const abs = absoluteUrl(site, href);
      const url = new URL(abs);

      if (url.pathname !== current.pathname) return null;

      return abs;
    })
    .get()
    .filter(Boolean) as string[];

  return uniqueBy(links, (x) => x);
}

function parseSectionNameFromPageText(pageText: string) {
  const m = pageText.match(
    /Part Category\s+›\s+([A-Za-z0-9,&/()\- ]+?)\s+(?:Part Title|[A-Z][a-z]+ [A-Z][a-z]+)/,
  );
  return cleanText(m?.[1] ?? "");
}

function parseRowsFromHtml(html: string): ParsedRepairClinicRow[] {
  const $ = load(html);
  const rows: ParsedRepairClinicRow[] = [];

  // Target common part detail containers across all RepairClinic family sites (Whirlpool, Maytag, etc.)
  $(".search-result, .part-info-container, .part-detail, div[data-item-id], .product-card, .part-box, .item-card").each((_, el) => {
    const $el = $(el);
    
    const title = cleanText($el.find(".part-title, .title, .part-name, h3, .product-name").first().text());
    const itemId = cleanText($el.find(".item-number, .part-number, .part-id, .sku-number").first().text()).replace(/Item #/i, "").trim();
    const manufacturerPartNumber = cleanText($el.find(".mfg-part-number, .manufacturer-part-number, .mfg-number, .model-number").first().text())
      .replace(/OEM Part - Manufacturer #/i, "")
      .replace(/Manufacturer #/i, "")
      .trim()
      .toUpperCase();

    const description = cleanText($el.find(".part-description, .description, .p-desc, .product-description").first().text());
    const nlaStatus = /No Longer Available/i.test($el.text()) || /Discontinued/i.test($el.text());

    if (itemId || manufacturerPartNumber) {
      rows.push({
        itemId: itemId || manufacturerPartNumber,
        title: title || manufacturerPartNumber,
        description: description || title || manufacturerPartNumber,
        manufacturerPartNumber,
        nlaStatus,
        replacementNote: /replaces?/i.test($el.text()) ? "Site notes replacement coverage" : null,
      });
    }
  });

  return uniqueBy(rows, (row) => `${row.itemId}|${row.manufacturerPartNumber}`);
}

function parseRowsFromCategoryText(pageText: string): ParsedRepairClinicRow[] {
  const rows: ParsedRepairClinicRow[] = [];
  const matches = [...pageText.matchAll(/([A-Z][A-Za-z0-9/&,'().\- ]+?)\s+Item #\s*(\d+)\s+[\s\S]*?OEM Part - Manufacturer #\s*([A-Z0-9-]+)/g)];

  for (const match of matches) {
    rows.push({
      itemId: cleanText(match[2]),
      title: cleanText(match[1]),
      description: cleanText(match[1]),
      manufacturerPartNumber: cleanText(match[3]).toUpperCase(),
      nlaStatus: false,
      replacementNote: null,
    });
  }
  return uniqueBy(rows, (row) => `${row.itemId}|${row.manufacturerPartNumber}`);
}

function rowsToStructuredText(input: {
  model: string;
  sectionName: string;
  rows: ParsedRepairClinicRow[];
  provider: string;
}) {
  const lines = [
    `SOURCE_PROVIDER: ${input.provider}`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
  ];

  for (const row of input.rows) {
    lines.push(
      [
        "ROW",
        `diagram_number=item-${row.itemId}`,
        `description=${row.description || row.title}`,
        `original_part_number=`,
        `current_service_part_number=${row.manufacturerPartNumber}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

async function fetchCategorySources(input: {
  site: string;
  providerName: string;
  model: string;
  sectionName: string;
  categoryUrl: string;
}) {
  const queue = [input.categoryUrl];
  const seen = new Set<string>();
  const allRows: ParsedRepairClinicRow[] = [];

  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchHtml(url);
    const rows = parseRowsFromHtml(html);
    
    // Fallback to text if DOM parsing returned empty
    if (rows.length === 0) {
      const pageText = htmlToText(html);
      const textRows = parseRowsFromCategoryText(pageText);
      rows.push(...textRows);
    }

    allRows.push(...rows);

    const nextLinks = parsePaginationLinks(input.site, html, url);
    for (const next of nextLinks) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  const rows = uniqueBy(allRows, (row) => `${row.itemId}|${row.manufacturerPartNumber}`);

  if (!rows.length) return null;

  return {
    sourceUrl: input.categoryUrl,
    sourceType: "oem" as const,
    provider: input.providerName,
    sectionName: input.sectionName,
    text: rowsToStructuredText({
      model: input.model,
      sectionName: input.sectionName,
      rows,
      provider: input.providerName,
    }),
    meta: {
      rowCount: rows.length,
      sectionType: "category",
    },
  };
}

async function fetchRepairClinicSources(input: {
  providerName: string;
  site: string;
  brandId: number;
  model: string;
  productType: string | null | undefined;
}) {
  const model = normalizeModel(input.model);
  const productIds = guessProductIds(input.productType);

  for (const productId of productIds) {
    const modelPageUrl = await findModelPageUrl({
      site: input.site,
      brandId: input.brandId,
      productId,
      model,
    });

    if (!modelPageUrl) continue;

    const modelHtml = await fetchHtml(modelPageUrl);
    const categoryLinks = parseCategoryLinks({
      site: input.site,
      modelPageUrl,
      html: modelHtml,
      model,
    });

    if (!categoryLinks.length) {
      const rows = parseRowsFromHtml(modelHtml);
      
      if (rows.length === 0) {
        const text = htmlToText(modelHtml);
        const textRows = parseRowsFromCategoryText(text);
        rows.push(...textRows);
      }

      const inferredSection = "Model Page";

      if (rows.length) {
        return [
          {
            sourceUrl: modelPageUrl,
            sourceType: "oem" as const,
            provider: input.providerName,
            sectionName: inferredSection,
            text: rowsToStructuredText({
              model,
              sectionName: inferredSection,
              rows,
              provider: input.providerName,
            }),
            meta: {
              rowCount: rows.length,
              sectionType: "model-page",
            },
          },
        ];
      }

      continue;
    }

    const sources: RetrievedSource[] = [];

    for (const category of categoryLinks) {
      try {
        const source = await fetchCategorySources({
          site: input.site,
          providerName: input.providerName,
          model,
          sectionName: category.sectionName,
          categoryUrl: category.url,
        });

        if (source) {
          sources.push(source);
        }
      } catch {
        // keep going
      }
    }

    if (sources.length) {
      return uniqueBy(sources, (s) => `${s.sectionName}|${s.sourceUrl}`);
    }
  }

  return [];
}

export const repairClinicFamilyProvider: SourceProvider = {
  name: "repairclinic-family",
  priority: 20,

  supports(input: ProviderInput) {
    if (!normalizeModel(input.model)) return false;
    return !!guessBrandConfig(input.brand);
  },

  async fetchSources(input: ProviderInput & { productType?: string | null }) {
    const config = guessBrandConfig(input.brand);
    const model = normalizeModel(input.model);

    if (!config || !model) return [];

    return fetchRepairClinicSources({
      providerName: `repairclinic-${config.key}`,
      site: config.site,
      brandId: config.brandId,
      model,
      productType: input.productType ?? null,
    });
  },
};
