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
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";
import {
  searchExistingGroundingLayer,
  dedupeSearchHits,
} from "../search/search-adapter";

const LG_FAMILY_BRANDS = new Set(["lg"]);

type ParsedLgPart = {
  title: string;
  description: string;
  partNumber: string;
  sectionName: string;
  sourceUrl: string;
};

function classifyLgSection(title: string) {
  const t = cleanText(title).toLowerCase();

  if (t.includes("hose") || t.includes("tube")) return "Hose, Tube & Fitting";
  if (t.includes("valve")) return "Valve & Float";
  if (t.includes("pump")) return "Pump";
  if (t.includes("motor")) return "Motor";
  if (t.includes("filter")) return "Filter";
  if (t.includes("gasket") || t.includes("seal")) return "Gasket & Seal";
  if (t.includes("switch")) return "Switch";
  if (t.includes("sensor") || t.includes("thermistor")) return "Sensor & Thermistor";
  if (t.includes("board") || t.includes("pcb") || t.includes("display") || t.includes("control")) {
    return "Circuit Board & Timer";
  }
  if (t.includes("door")) return "Door";
  if (t.includes("drum") || t.includes("tub") || t.includes("basket")) return "Drum & Tub";
  if (
    t.includes("shock") ||
    t.includes("spring") ||
    t.includes("damper") ||
    t.includes("absorber")
  ) {
    return "Suspension";
  }
  if (t.includes("heater") || t.includes("heating")) return "Heating Element";
  if (t.includes("panel") || t.includes("touchpad")) return "Panel";

  return "Compatible Parts";
}

async function searchLgPartPages(model: string) {
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: [`site:lgparts.com/products "${model}"`],
      domain: "lgparts.com",
      maxResults: 24,
    }),
  );

  return hits
    .filter((hit) => {
      try {
        const url = new URL(hit.url);
        return (
          url.hostname === "lgparts.com" ||
          url.hostname.endsWith(".lgparts.com")
        ) && url.pathname.startsWith("/products/");
      } catch {
        return false;
      }
    })
    .slice(0, 24);
}

function extractPartNumber(text: string) {
  const match = text.match(/Part Number\s*:\s*([A-Z0-9-]{5,})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function extractCompatibilityText(text: string, model: string) {
  const upper = text.toUpperCase();

  if (!upper.includes(model)) return false;

  return (
    upper.includes("CORRECT REPLACEMENT FOR THE FOLLOWING MODEL NUMBERS") ||
    upper.includes("DESIGNED SPECIFICALLY FOR COMPATIBILITY WITH MODEL")
  );
}

async function parseLgPartPage(input: {
  url: string;
  model: string;
}): Promise<ParsedLgPart | null> {
  try {
    const html = await fetchHtml(input.url);
    const $ = load(html);
    const bodyText = cleanText($("body").text());

    if (!extractCompatibilityText(bodyText, input.model)) {
      return null;
    }

    const h1 = cleanText($("h1").first().text());
    const title = h1 || cleanText($("title").text());
    const partNumber = extractPartNumber(bodyText);

    if (!title || !partNumber) {
      return null;
    }

    const normalizedTitle = title
      .replace(new RegExp(`^LG\\s+${input.model}\\s+`, "i"), "")
      .replace(new RegExp(`\\s+-\\s+${partNumber}$`, "i"), "")
      .trim();

    const description = cleanText(
      bodyText.match(/Product Information\s+([\s\S]*?)\s+(?:Bought Together|Shipping & delivery|Recently viewed products)/i)?.[1] ??
        normalizedTitle,
    );

    return {
      title: normalizedTitle || title,
      description: description || normalizedTitle || title,
      partNumber,
      sectionName: classifyLgSection(normalizedTitle || title),
      sourceUrl: input.url,
    };
  } catch {
    return null;
  }
}

function rowsToStructuredText(input: {
  model: string;
  sectionName: string;
  row: ParsedLgPart;
}) {
  return [
    `SOURCE_PROVIDER: lg-family`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
    [
      "ROW",
      `diagram_number=lg-${input.row.partNumber}`,
      `description=${input.row.description}`,
      `original_part_number=`,
      `current_service_part_number=${input.row.partNumber}`,
      `nla_status=false`,
      `replacement_note=Compatible model match from official LG part page`,
    ].join("|"),
  ].join("\n");
}

export const lgFamilyProvider: SourceProvider = {
  name: "lg-family",
  priority: 20,

  supports(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return false;

    const brand = normalizeBrand(input.brand);
    return !brand || LG_FAMILY_BRANDS.has(brand);
  },

  async fetchSources(input: ProviderInput & { visualTruth?: any }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const hits = await searchLgPartPages(model);
    if (!hits.length) return [];

    const parsed = [];

    for (const hit of hits) {
      const row = await parseLgPartPage({
        url: hit.url,
        model,
      });

      if (row) {
        parsed.push(row);
      }
    }

    const uniqueRows = uniqueBy(parsed, (row) => row.partNumber);

    return uniqueRows.map((row) => ({
      sourceUrl: row.sourceUrl,
      sourceType: "oem" as const,
      provider: "lg-family",
      sectionName: row.sectionName,
      text: rowsToStructuredText({
        model,
        sectionName: row.sectionName,
        row,
      }),
      meta: {
        rowCount: 1,
        sectionType: "compatible-model-part-page",
        visualTruth: input.visualTruth,
      },
    }));
  },
};
