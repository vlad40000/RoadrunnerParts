import "server-only";
import { load } from "cheerio";
import type {
  ProviderInput,
  RetrievedSource,
  SourceProvider,
} from "./types";
import {
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";
import {
  searchExistingGroundingLayer,
  dedupeSearchHits,
} from "../search/search-adapter";

const SAMSUNG_FAMILY_BRANDS = new Set(["samsung"]);

type ParsedSamsungPart = {
  title: string;
  description: string;
  partNumber: string;
  sectionName: string;
  sourceUrl: string;
  nlaStatus: boolean;
  replacementNote: string | null;
};

function modelToSlug(model: string) {
  return model.toLowerCase().replace(/\//g, "-").replace(/\s+/g, "");
}

function baseModel(model: string) {
  return normalizeModel(model).split("/")[0] ?? normalizeModel(model);
}

function looksLikeSamsungProductUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "samsungparts.com" ||
        parsed.hostname.endsWith(".samsungparts.com")) &&
      parsed.pathname.startsWith("/products/")
    );
  } catch {
    return false;
  }
}

function looksLikeSamsungModelLandingUrl(url: string, model: string) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.toLowerCase();
    const modelSlug = modelToSlug(model);
    return slug.includes(modelSlug) && slug.endsWith("-parts");
  } catch {
    return false;
  }
}

function classifySamsungSection(title: string) {
  const t = cleanText(title).toLowerCase();

  if (t.includes("ice maker")) return "Ice Maker";
  if (t.includes("filter")) return "Filter";
  if (t.includes("door bin") || t.includes("bin")) return "Door Bin";
  if (t.includes("water housing") || t.includes("water filter housing")) {
    return "Filter Housing";
  }
  if (t.includes("board") || t.includes("pcb") || t.includes("control")) {
    return "Circuit Board & Timer";
  }
  if (t.includes("pump")) return "Pump";
  if (t.includes("valve")) return "Valve & Float";
  if (t.includes("sensor") || t.includes("thermistor")) {
    return "Sensor & Thermistor";
  }
  if (t.includes("door boot") || t.includes("gasket") || t.includes("seal")) {
    return "Gasket & Seal";
  }
  if (t.includes("drawer") || t.includes("dispenser")) return "Dispenser";
  if (t.includes("basket") || t.includes("drum") || t.includes("tub")) {
    return "Drum & Tub";
  }
  if (t.includes("heater") || t.includes("heating")) return "Heating Element";
  if (t.includes("switch")) return "Switch";
  if (t.includes("motor")) return "Motor";
  if (t.includes("panel") || t.includes("display") || t.includes("touch")) {
    return "Panel";
  }

  return "Compatible Parts";
}

function extractPartNumber(text: string) {
  const patterns = [
    /Part\s*#:\s*([A-Z0-9-]{5,})/i,
    /Part\s*Number:\s*([A-Z0-9-]{5,})/i,
    /Part\s*No\.?:\s*([A-Z0-9-]{5,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

function containsSupportedModelsBlock(text: string) {
  const upper = text.toUpperCase();
  return (
    upper.includes("SUPPORTED MODELS") &&
    upper.includes("CORRECT REPLACEMENT FOR THE FOLLOWING MODEL NUMBERS")
  );
}

function containsTargetModel(text: string, model: string) {
  const upper = text.toUpperCase();
  const full = normalizeModel(model);
  const base = baseModel(model);

  return upper.includes(full) || upper.includes(base);
}

function cleanSamsungTitle(title: string, partNumber: string) {
  return cleanText(
    title
      .replace(new RegExp(`\\b${partNumber}\\b`, "i"), "")
      .replace(/^Samsung\s+/i, "")
      .trim(),
  );
}

function buildSamsungQueries(model: string) {
  const normalized = normalizeModel(model);
  const base = baseModel(normalized);

  return uniqueBy(
    [
      `site:samsungparts.com/products "${normalized}" "Supported Models"`,
      `site:samsungparts.com/products "${normalized}" "Does this part fit my model?"`,
      `site:samsungparts.com/products "${base}" "Supported Models"`,
      `site:samsungparts.com/products "${base}" Samsung`,
    ],
    (value) => value.toLowerCase(),
  );
}

async function searchSamsungPartPages(model: string) {
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: buildSamsungQueries(model),
      domain: "samsungparts.com",
      maxResults: 30,
    }),
  );

  return hits
    .filter((hit) => looksLikeSamsungProductUrl(hit.url))
    .filter((hit) => !looksLikeSamsungModelLandingUrl(hit.url, model))
    .slice(0, 30);
}

async function parseSamsungPartPage(input: {
  url: string;
  model: string;
}): Promise<ParsedSamsungPart | null> {
  try {
    const html = await fetchHtml(input.url);
    const text = htmlToText(html);

    if (!containsSupportedModelsBlock(text)) return null;
    if (!containsTargetModel(text, input.model)) return null;

    const $ = load(html);
    const h1 = cleanText($("h1").first().text());
    const partNumber = extractPartNumber(text);

    if (!h1 || !partNumber) return null;

    const cleanedTitle = cleanSamsungTitle(h1, partNumber) || h1;

    const nlaStatus =
      /no longer available/i.test(text) &&
      !/original part/i.test(text);

    const replacementNote = /comparable and can be used instead/i.test(text)
      ? "Site indicates comparable replacement is available"
      : null;

    return {
      title: cleanedTitle,
      description: cleanedTitle,
      partNumber,
      sectionName: classifySamsungSection(cleanedTitle),
      sourceUrl: input.url,
      nlaStatus,
      replacementNote,
    };
  } catch {
    return null;
  }
}

function rowsToStructuredText(input: {
  model: string;
  row: ParsedSamsungPart;
}) {
  return [
    `SOURCE_PROVIDER: samsung-family`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.row.sectionName}`,
    [
      "ROW",
      `diagram_number=samsung-${input.row.partNumber}`,
      `description=${input.row.description}`,
      `original_part_number=${input.row.partNumber}`,
      `current_service_part_number=${input.row.partNumber}`,
      `nla_status=${input.row.nlaStatus ? "true" : "false"}`,
      `replacement_note=${input.row.replacementNote ?? "Compatible model match from Samsung parts page"}`,
    ].join("|"),
  ].join("\n");
}

export const samsungFamilyProvider: SourceProvider = {
  name: "samsung-family",
  priority: 20,

  supports(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return false;

    const brand = normalizeBrand(input.brand);
    return !brand || SAMSUNG_FAMILY_BRANDS.has(brand);
  },

  async fetchSources(input: ProviderInput & { visualTruth?: any }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const hits = await searchSamsungPartPages(model);
    if (!hits.length) return [];

    const parsed: ParsedSamsungPart[] = [];

    for (const hit of hits) {
      const row = await parseSamsungPartPage({
        url: hit.url,
        model,
      });

      if (row) {
        parsed.push(row);
      }
    }

    const rows = uniqueBy(parsed, (row) => row.partNumber);

    return rows.map<RetrievedSource>((row) => ({
      sourceUrl: row.sourceUrl,
      sourceType: "oem",
      provider: "samsung-family",
      sectionName: row.sectionName,
      text: rowsToStructuredText({
        model,
        row,
      }),
      meta: {
        rowCount: 1,
        sectionType: "supported-model-part-page",
        visualTruth: input.visualTruth,
      },
    }));
  },
};
