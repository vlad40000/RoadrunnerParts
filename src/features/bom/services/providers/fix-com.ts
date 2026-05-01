import "server-only";
import { load } from "cheerio";
import type { ProviderInput, SourceProvider } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  cleanText,
  fetchHtml,
  normalizeModel,
  runWithConcurrency,
  uniqueBy,
} from "./utils";

const FIX_BASE = "https://www.fix.com";

const FIX_BRAND_SLUGS: Record<string, string> = {
  GE: "ge",
  "GENERAL ELECTRIC": "ge",
  "GE APPLIANCES": "ge",
  HOTPOINT: "hotpoint",
  HAIER: "haier",
  MONOGRAM: "monogram",
  WHIRLPOOL: "whirlpool",
  MAYTAG: "maytag",
  KITCHENAID: "kitchenaid",
  AMANA: "amana",
  KENMORE: "kenmore",
  FRIGIDAIRE: "frigidaire",
  ELECTROLUX: "electrolux",
  LG: "lg",
  SAMSUNG: "samsung",
  BOSCH: "bosch",
};

const FIX_APPLIANCE_SLUGS: Record<string, string> = {
  washer: "washer",
  "washing machine": "washer",
  dryer: "dryer",
  dishwasher: "dishwasher",
  refrigerator: "refrigerator",
  fridge: "refrigerator",
  freezer: "freezer",
  range: "range",
  stove: "range",
  oven: "range",
  microwave: "microwave",
  cooktop: "cooktop",
};

export type FixPartCount = {
  visibleCount: number | null;
  totalPartsAvailable: number | null;
  evidence: string | null;
};

export type FixDiagramLink = {
  diagramName: string;
  diagramUrl: string;
  thumbnailUrl: string | null;
  evidence: string;
};

export type FixRawPartRow = {
  source: "fix.com";
  sectionName: string;
  sectionUrl: string;
  diagramRef: string | null;
  providerItemId: string | null;
  rawPartNumber: string;
  rawPartName: string;
  rawCategory: string;
  quantity: string | null;
  substitutePartNumber: string | null;
  serialNote: string | null;
  evidenceUrl: string;
  rawPayload: Record<string, unknown>;
};

export function absoluteFixUrl(path?: string | null, baseUrl = FIX_BASE) {
  const value = cleanText(path ?? "");
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return new URL(value, baseUrl).toString();
}

export function buildFixModelUrl(input: {
  brand?: string | null;
  make?: string | null;
  applianceType?: string | null;
  productType?: string | null;
  model: string;
}) {
  const rawBrand = cleanText(input.brand ?? input.make ?? "");
  const rawApplianceType = cleanText(input.applianceType ?? input.productType ?? "");
  const brandKey = rawBrand.toUpperCase();
  const applianceKey = rawApplianceType.toLowerCase();

  const brandSlug =
    FIX_BRAND_SLUGS[brandKey] ||
    rawBrand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let applianceSlug = FIX_APPLIANCE_SLUGS[applianceKey] || "";

  if (!applianceSlug) {
    for (const [key, slug] of Object.entries(FIX_APPLIANCE_SLUGS)) {
      if (applianceKey.includes(key)) {
        applianceSlug = slug;
        break;
      }
    }
  }

  if (!applianceSlug) {
    applianceSlug = applianceKey.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  const model = normalizeModel(input.model);
  return `${FIX_BASE}/models/${applianceSlug || "appliance"}/${brandSlug || "appliance"}/${model}/`;
}

export async function fetchFixModelPage(input: {
  model: string;
  brand?: string | null;
  productType?: string | null;
  applianceType?: string | null;
}) {
  const model = normalizeModel(input.model);
  if (!model) return null;

  const deterministicUrl = buildFixModelUrl({
    brand: input.brand ?? null,
    applianceType: input.applianceType ?? input.productType ?? null,
    model,
  });

  try {
    const html = await fetchHtml(deterministicUrl);
    const count = parseFixPartCount(html);
    const diagrams = parseFixDiagramLinks(html, deterministicUrl);
    const $ = load(html);
    const pageTitle = cleanText($("title").text()).toUpperCase();
    const h1Text = cleanText($("h1").text()).toUpperCase();

    // Strict exact match check
    const isExactMatch = pageTitle.includes(model) || h1Text.includes(model);

    if (
      isExactMatch &&
      (count.totalPartsAvailable ||
        diagrams.length > 0 ||
        /Part List|Diagrams|Parts/i.test(html))
    ) {
      return {
        url: deterministicUrl,
        html,
        isExactMatch,
        resolution: { url: deterministicUrl, source: "deterministic", exactModelMatch: isExactMatch },
      };
    }
  } catch {
    // Fall back to exact model search below.
  }

  const resolution = await resolveExactModelUrl({
    model,
    domain: "fix.com",
    preferredQueries: [
      `site:fix.com/models "${model}" "Viewing" "of"`,
      `site:fix.com/models "${model}" "Part Number"`,
      `site:fix.com/models "${model}" "Diagrams"`,
      `site:fix.com "${model}"`,
    ],
  });

  if (!resolution?.url) return null;

  const html = await fetchHtml(resolution.url);
  const $ = load(html);
  const isExactMatch = cleanText($("title").text() + " " + $("h1").text()).toUpperCase().includes(model);

  return { 
    url: resolution.url, 
    html, 
    isExactMatch,
    resolution: { 
      ...resolution, 
      exactModelMatch: isExactMatch 
    } 
  };
}

export function parseFixPartCount(html: string): FixPartCount {
  const $ = load(html);

  const direct = cleanText(
    $('a[aria-describedby="Parts_SeeAll"] span').first().text(),
  );

  const candidates = [
    direct,
    ...$("a, span, div, p")
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter((text) => /Viewing\s+\d+(?:\s*-\s*\d+)?\s+of\s+\d+/i.test(text)),
  ];

  for (const text of candidates) {
    const match = text.match(/Viewing\s+(\d+)(?:\s*-\s*\d+)?\s+of\s+(\d+)/i);
    if (match) {
      return {
        visibleCount: Number(match[1]),
        totalPartsAvailable: Number(match[2]),
        evidence: match[0],
      };
    }
  }

  return {
    visibleCount: null,
    totalPartsAvailable: null,
    evidence: null,
  };
}

export function parseFixDiagramLinks(html: string, modelUrl: string): FixDiagramLink[] {
  const $ = load(html);

  const diagrams = $(
    ".row.mb-3.diagrams.no-gutters .diagram-item, .model-section-card, .diagram-card, .model-diagram, .diagram-item",
  )
    .toArray()
    .map((el) => {
      const link = $(el).find("a").first();
      const img = $(el).find("img").first();
      const diagramName = cleanText(
        $(el).find("span, h3, .card-title, .section-name, .model-section-title").first().text(),
      );
      const href = link.attr("href");
      const diagramUrl = absoluteFixUrl(href, modelUrl);
      const thumbnailUrl = absoluteFixUrl(img.attr("src"), modelUrl);
      const evidence = cleanText(img.attr("alt")) || diagramName;

      if (!diagramName || !diagramUrl) return null;

      return {
        diagramName,
        diagramUrl,
        thumbnailUrl,
        evidence,
      };
    })
    .filter(Boolean) as FixDiagramLink[];

  return uniqueBy(diagrams, (diagram) => diagram.diagramUrl);
}

export async function fetchFixDiagramPage(url: string) {
  return fetchHtml(url);
}

export function parseFixPartAlt(alt: string) {
  const text = cleanText(alt);
  const match = text.match(
    /^(.*?)\s+(?:[\u2013\u2014-]|\u00e2\u20ac[\u201c\u201d])\s+Part Number:\s*([A-Z0-9-]+)$/i,
  );

  if (!match) return null;

  return {
    description: cleanText(match[1]),
    partNumber: cleanText(match[2]).toUpperCase(),
  };
}

function bestFixImageUrl($img: any) {
  const direct = absoluteFixUrl($img.attr("src"));
  const $picture = $img.closest("picture");
  const srcset =
    $picture.find('source[type="image/webp"]').attr("srcset") ||
    $picture.find("source").first().attr("srcset") ||
    $img.attr("srcset");

  if (!srcset) return direct;

  const highRes = srcset
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => /\s2x$/i.test(entry));

  const candidate = highRes || srcset.split(",")[0]?.trim();
  return absoluteFixUrl(candidate?.split(/\s+/)[0]) || direct;
}

export function parseFixDiagramParts(
  html: string,
  sectionName: string,
  sectionUrl: string,
): FixRawPartRow[] {
  const $ = load(html);
  const rows: FixRawPartRow[] = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/\/(?:parts|part)\//i.test(href)) return;

    const img = $(el).find("img[alt*='Part']").first();
    const alt = cleanText(img.attr("alt"));
    const parsed = parseFixPartAlt(alt);

    if (!parsed) return;

    const fixIdMatch = href.match(/\/(fix\d+)\//i);
    const modelNumMatch = href.match(/[?&]ModelNum=([^&]+)/i);
    const evidenceUrl = absoluteFixUrl(href, sectionUrl) || sectionUrl;

    rows.push({
      source: "fix.com",
      sectionName,
      sectionUrl,
      diagramRef: null,
      providerItemId: fixIdMatch?.[1]?.toLowerCase() || null,
      rawPartNumber: parsed.partNumber,
      rawPartName: parsed.description,
      rawCategory: sectionName,
      quantity: null,
      substitutePartNumber: null,
      serialNote: null,
      evidenceUrl,
      rawPayload: {
        href: evidenceUrl,
        imageAlt: alt,
        modelNum: modelNumMatch ? decodeURIComponent(modelNumMatch[1]) : null,
        imageUrl: bestFixImageUrl(img),
      },
    });
  });

  return uniqueBy(rows, (row) => `${row.rawPartNumber}|${row.sectionName}`);
}

export function normalizeFixRowsToManufacturerShape(rows: FixRawPartRow[]) {
  return rows.map((row) => ({
    source: row.source,
    sectionName: row.sectionName,
    sectionUrl: row.sectionUrl,
    diagramRef: row.diagramRef,
    providerItemId: row.providerItemId,
    rawPartNumber: row.rawPartNumber,
    rawPartName: row.rawPartName,
    rawCategory: row.rawCategory,
    quantity: row.quantity,
    substitutePartNumber: row.substitutePartNumber,
    serialNote: row.serialNote,
    evidenceUrl: row.evidenceUrl,
    rawPayload: row.rawPayload,
  }));
}

export function parseFixRowsToText(html: string, sourceUrl: string, sectionName = "All Model Parts") {
  return parseFixDiagramParts(html, sectionName, sourceUrl)
    .map((row) =>
      [
        "ROW",
        `diagram_number=${row.diagramRef ?? ""}`,
        `description=${row.rawPartName}`,
        "original_part_number=",
        `current_service_part_number=${row.rawPartNumber}`,
        "nla_status=false",
        `replacement_note=${row.substitutePartNumber ?? ""}`,
        `source_url=${row.evidenceUrl}`,
        `image_url=${String(row.rawPayload.imageUrl ?? "")}`,
        `evidence=fix-id:${row.providerItemId ?? ""}`,
      ].join("|"),
    )
    .join("\n");
}

function fixContext(input: {
  model: string;
  sourceUrl: string;
  totalPartsAvailable: number | null;
  diagrams: FixDiagramLink[];
}) {
  return {
    model: input.model,
    source: "fix.com",
    sourceUrl: input.sourceUrl,
    totalPartsAvailable: input.totalPartsAvailable,
    diagrams: input.diagrams.map((diagram) => ({
      diagramName: diagram.diagramName,
      diagramUrl: diagram.diagramUrl,
    })),
    knownPartNumbers: [],
  };
}

export async function fetchFixDistributorBom(input: {
  modelNumber: string;
  brand?: string | null;
  productType?: string | null;
  applianceType?: string | null;
  plan?: Record<string, unknown>;
}) {
  const model = normalizeModel(input.modelNumber);
  const page = await fetchFixModelPage({
    model,
    brand: input.brand ?? null,
    productType: input.productType ?? input.applianceType ?? null,
  });

  if (!page) {
    return {
      truthSource: "Fix.com distributor diagram catalog",
      sourceStrategy: "fix-diagram-deterministic",
      modelUrl: null,
      summary: "",
      source: "fix.com",
      sources: [],
      diagrams: [],
      parts: [],
      coverage: {
        provider: "fix.com",
        sectionsDiscovered: 0,
        sectionsFetched: 0,
        sectionFetchFailures: 1,
        paginationComplete: false,
        flags: ["fix-model-page-missing"],
      },
      planMeta: {
        truthOrder: input.plan?.truthOrder || [],
        fallbackSources: input.plan?.distributorFallbacks || ["fix.com"],
      },
    };
  }

  const count = parseFixPartCount(page.html);
  const diagrams = parseFixDiagramLinks(page.html, page.url);
  const fetchTargets =
    diagrams.length > 0
      ? diagrams
      : [{ diagramName: "All Model Parts", diagramUrl: page.url, thumbnailUrl: null, evidence: "model page" }];

  let sectionFetchFailures = 0;
  const sectionResults = await runWithConcurrency(
    fetchTargets,
    Math.max(1, Number.parseInt(process.env.BOM_PROVIDER_CONCURRENCY ?? "3", 10) || 3),
    async (diagram) => {
      try {
        const html = diagram.diagramUrl === page.url ? page.html : await fetchFixDiagramPage(diagram.diagramUrl);
        return parseFixDiagramParts(html, diagram.diagramName, diagram.diagramUrl);
      } catch {
        sectionFetchFailures += 1;
        return [];
      }
    },
  );

  const parts = normalizeFixRowsToManufacturerShape(
    uniqueBy(sectionResults.flat(), (row) => `${row.rawPartNumber}|${row.sectionName}`),
  );

  const flags: string[] = [];
  if (diagrams.length === 0) flags.push("fix-no-diagram-links");
  if (parts.length === 0) flags.push("fix-no-parts");
  if (
    count.totalPartsAvailable &&
    parts.length > 0 &&
    parts.length < count.totalPartsAvailable
  ) {
    flags.push("fix-partial-diagram-coverage");
  }

  return {
    truthSource: "Fix.com distributor diagram catalog",
    sourceStrategy: "fix-diagram-deterministic",
    modelUrl: page.url,
    summary: `Fix.com deterministic diagram data for ${model}.`,
    source: "fix.com",
    sources: [
      { title: "Fix.com model page", uri: page.url },
      ...diagrams.map((diagram) => ({ title: diagram.diagramName, uri: diagram.diagramUrl })),
    ],
    diagrams,
    totalPartsAvailable: count.totalPartsAvailable,
    parts,
    coverage: {
      provider: "fix.com",
      sectionsDiscovered: fetchTargets.length,
      sectionsFetched: fetchTargets.length - sectionFetchFailures,
      sectionFetchFailures,
      paginationComplete: sectionFetchFailures === 0,
      flags,
    },
    planMeta: {
      truthOrder: input.plan?.truthOrder || [],
      fallbackSources: input.plan?.distributorFallbacks || ["fix.com"],
    },
  };
}

export const fixComProvider: SourceProvider = {
  name: "fix.com",
  priority: 5,

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput & { productType?: string | null }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const page = await fetchFixModelPage({
      model,
      brand: input.brand,
      productType: input.productType ?? null,
    });

    if (!page) return [];

    const count = parseFixPartCount(page.html);
    const diagrams = parseFixDiagramLinks(page.html, page.url);
    const context = fixContext({
      model,
      sourceUrl: page.url,
      totalPartsAvailable: count.totalPartsAvailable,
      diagrams,
    });

    // SENTINEL CHECK: Suspected DOM drift detection
    if (count.totalPartsAvailable && count.totalPartsAvailable > 0 && diagrams.length === 0) {
      const rowCount = parseFixRowsToText(page.html, page.url).split("\n").filter(l => l.startsWith("ROW|")).length;
      if (rowCount === 0) {
        console.warn(`[Sentinel] ⚠️ DOM Drift Alert on fix.com: Model ${model} reports ${count.totalPartsAvailable} parts, but 0 diagrams and 0 rows were found. The selector '.diagram-item' might have changed.`);
      }
    }

    if (diagrams.length > 0) {
      return diagrams.map((diagram) => ({
        sourceUrl: diagram.diagramUrl,
        sourceType: "diagram" as const,
        provider: "fix.com",
        sectionName: diagram.diagramName,
        sectionOriginal: diagram.diagramName,
        text: [
          "SOURCE_PROVIDER: fix.com",
          `MODEL: ${model}`,
          `SECTION: ${diagram.diagramName}`,
          `FIX_CONTEXT: ${JSON.stringify(context)}`,
          "(Diagram rows are fetched from the Fix.com diagram page during group extraction)",
        ].join("\n"),
        meta: {
          ...page.resolution,
          exactModelMatch: page.isExactMatch,
          isDiagramGroup: true,
          totalPartsAvailable: count.totalPartsAvailable,
          expectedPartsTotal: count.totalPartsAvailable,
          expectedPartsSource: "fix.com",
          expectedPartsConfidence: 0.95,
          countEvidence: count.evidence,
          modelPageUrl: page.url,
          fixContext: context,
          thumbnailUrl: diagram.thumbnailUrl,
        },
      }));
    }

    const structuredText = parseFixRowsToText(page.html, page.url);
    const rowCount = structuredText.split("\n").filter((line) => line.startsWith("ROW|")).length;

    return [
      {
        sourceUrl: page.url,
        sourceType: "distributor" as const,
        provider: "fix.com",
        sectionName: "All Model Parts",
        text: [
          "SOURCE_PROVIDER: fix.com",
          `MODEL: ${model}`,
          "SECTION: All Model Parts",
          `FIX_CONTEXT: ${JSON.stringify(context)}`,
          structuredText,
        ].join("\n"),
        meta: {
          ...page.resolution,
          exactModelMatch: page.isExactMatch,
          rowCount,
          totalPartsAvailable: count.totalPartsAvailable,
          expectedPartsTotal: count.totalPartsAvailable,
          expectedPartsSource: "fix.com",
          expectedPartsConfidence: 0.95,
          countEvidence: count.evidence,
          modelPageUrl: page.url,
          fixContext: context,
        },
      },
    ];
  },
};

// Legacy alias to prevent breaking existing imports before grouped-bom.ts is updated
export const fixComDiagramsProvider = fixComProvider;
