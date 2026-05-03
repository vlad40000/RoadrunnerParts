// import "server-only";
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

const FRIGIDAIRE_FAMILY_BRANDS = new Set([
  "frigidaire",
  "electrolux",
  "gibson",
  "tappan",
  "kelvinator",
  "white-westinghouse",
]);

const COMMON_CATEGORY_NAMES = new Set([
  "Adhesive",
  "Axle, Roller, Shaft, Wheel",
  "Bearing",
  "Belt",
  "Blower Wheel & Fan Blade",
  "Bracket & Flange",
  "Cap, Lid & Cover",
  "Circuit Board & Timer",
  "Dishrack",
  "Dispenser",
  "Door",
  "Drum & Tub",
  "Duct & Venting",
  "Fastener",
  "Filter",
  "Fuse, Thermal Fuse & Breaker",
  "Gasket & Seal",
  "Grille & Kickplate",
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
  "Pump",
  "Sensor & Thermistor",
  "Spring",
  "Switch",
  "Thermostat",
  "Touchpad",
  "Trim",
  "Valve & Float",
  "Wash Arm & Wash Arm Support",
  "Wire, Receptacle & Wire Connector",
]);

type ParsedRow = {
  itemId: string;
  description: string;
  manufacturerPartNumber: string;
  nlaStatus: boolean;
  replacementNote: string | null;
};

function preferredSitesForBrand(brand: string | null | undefined) {
  const normalized = normalizeBrand(brand);

  if (normalized === "electrolux") {
    return [
      "https://www.electroluxapplianceparts.com",
      "https://www.frigidaireapplianceparts.com",
    ];
  }

  return [
    "https://www.frigidaireapplianceparts.com",
    "https://www.electroluxapplianceparts.com",
  ];
}

function buildSearchUrl(site: string, model: string) {
  return `${site}/Shop-For-Parts?searchText=${encodeURIComponent(model)}`;
}

function parseModelVariantLinks(input: {
  site: string;
  html: string;
  model: string;
}) {
  const $ = load(input.html);
  const model = normalizeModel(input.model);

  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = normalizeModel($(el).text());

      if (!href || !text) return null;
      if (!text.startsWith(model)) return null;
      if (!href.includes("/Shop-For-Parts/")) return null;

      return {
        model: text,
        url: absoluteUrl(input.site, href),
      };
    })
    .get()
    .filter(Boolean) as Array<{ model: string; url: string }>;

  return uniqueBy(links, (item) => `${item.model}|${item.url}`);
}

function parseCategoryLinks(input: {
  site: string;
  html: string;
  model: string;
}) {
  const $ = load(input.html);
  const model = normalizeModel(input.model);

  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href || !text) return null;
      if (!COMMON_CATEGORY_NAMES.has(text)) return null;
      if (!href.includes("/Shop-For-Parts/")) return null;
      if (!href.toUpperCase().includes(model)) return null;

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
      const next = new URL(abs);

      if (next.pathname !== current.pathname) return null;

      return abs;
    })
    .get()
    .filter(Boolean) as string[];

  return uniqueBy(links, (value) => value);
}

function parseRowsFromCategoryText(pageText: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  const matches = [
    ...pageText.matchAll(
      /([A-Z][A-Za-z0-9/&,'().\- ]+?)\s+Item #\s*(\d+)\s+[\s\S]*?OEM Part - Manufacturer #\s*([A-Z0-9-]+)([\s\S]*?)(?=(?:[A-Z][A-Za-z0-9/&,'().\- ]+?\s+Item #\s*\d+)|$)/g,
    ),
  ];

  for (const match of matches) {
    const title = cleanText(match[1]);
    const itemId = cleanText(match[2]);
    const manufacturerPartNumber = cleanText(match[3]).toUpperCase();
    const tail = cleanText(match[4]);

    if (!title || !itemId || !manufacturerPartNumber) continue;

    const description = cleanText(
      tail
        .replace(/Order by[\s\S]*$/i, "")
        .replace(/We sell the real thing![\s\S]*$/i, "")
        .replace(/OEM Part - Manufacturer #[A-Z0-9-]+/i, "")
        .trim(),
    );

    rows.push({
      itemId,
      description: description || title,
      manufacturerPartNumber,
      nlaStatus: /No Longer Available/i.test(tail),
      replacementNote: /replaces? many other parts/i.test(tail)
        ? "Site notes replacement coverage"
        : null,
    });
  }

  return uniqueBy(rows, (row) => `${row.itemId}|${row.manufacturerPartNumber}`);
}

function rowsToStructuredText(input: {
  provider: string;
  model: string;
  sectionName: string;
  rows: ParsedRow[];
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
        `description=${row.description}`,
        `original_part_number=`,
        `current_service_part_number=${row.manufacturerPartNumber}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

async function fetchCategorySource(input: {
  site: string;
  model: string;
  sectionName: string;
  categoryUrl: string;
}) {
  const queue = [input.categoryUrl];
  const seen = new Set<string>();
  const allRows: ParsedRow[] = [];

  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const html = await fetchHtml(url);
    const pageText = htmlToText(html);
    const rows = parseRowsFromCategoryText(pageText);
    allRows.push(...rows);

    const nextLinks = parsePaginationLinks(input.site, html, url);
    for (const next of nextLinks) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  const rows = uniqueBy(
    allRows,
    (row) => `${row.itemId}|${row.manufacturerPartNumber}`,
  );

  if (!rows.length) return null;

  return {
    sourceUrl: input.categoryUrl,
    sourceType: "oem" as const,
    provider: "frigidaire-family",
    sectionName: input.sectionName,
    text: rowsToStructuredText({
      provider: "frigidaire-family",
      model: input.model,
      sectionName: input.sectionName,
      rows,
    }),
    meta: {
      rowCount: rows.length,
      sectionType: "category",
    },
  };
}

async function fetchFamilySourcesFromSite(input: {
  site: string;
  model: string;
}) {
  const model = normalizeModel(input.model);
  const searchUrl = buildSearchUrl(input.site, model);
  const searchHtml = await fetchHtml(searchUrl);

  let categoryLinks = parseCategoryLinks({
    site: input.site,
    html: searchHtml,
    model,
  });

  if (!categoryLinks.length) {
    const variantLinks = parseModelVariantLinks({
      site: input.site,
      html: searchHtml,
      model,
    });

    for (const variant of variantLinks.slice(0, 8)) {
      try {
        const variantHtml = await fetchHtml(variant.url);
        categoryLinks = parseCategoryLinks({
          site: input.site,
          html: variantHtml,
          model: variant.model,
        });

        if (categoryLinks.length) {
          break;
        }
      } catch {
        // continue
      }
    }
  }

  if (!categoryLinks.length) {
    return [];
  }

  const sources: RetrievedSource[] = [];

  for (const category of categoryLinks) {
    try {
      const source = await fetchCategorySource({
        site: input.site,
        model,
        sectionName: category.sectionName,
        categoryUrl: category.url,
      });

      if (source) {
        sources.push(source);
      }
    } catch {
      // continue
    }
  }

  return uniqueBy(sources, (s) => `${s.sectionName}|${s.sourceUrl}`);
}

export const frigidaireFamilyProvider: SourceProvider = {
  name: "frigidaire-family",
  priority: 20,

  supports(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return false;

    const brand = normalizeBrand(input.brand);
    return !brand || FRIGIDAIRE_FAMILY_BRANDS.has(brand);
  },

  async fetchSources(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const sites = preferredSitesForBrand(input.brand);

    for (const site of sites) {
      try {
        const sources = await fetchFamilySourcesFromSite({
          site,
          model,
        });

        if (sources.length) {
          return sources;
        }
      } catch {
        // continue
      }
    }

    return [];
  },
};
