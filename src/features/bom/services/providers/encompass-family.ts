import "server-only";

import { load } from "cheerio";
import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
  type EncompassParsedRow,
} from "./encompass-backed-family";
import { cleanText, normalizeModel, uniqueBy, normalizeBrand, absoluteUrl, fetchHtml } from "./utils";
import { buildEncompassUrl, parseEncompassExplodedViewUrl } from "./deterministic-urls";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import { type ProviderInput, type RetrievedSource } from "./types";

interface EncompassParseRowsInput {
  html: string;
  text: string;
  model: string;
  variationUrl: string;
  variationCode: string | null;
}

interface EncompassSection {
  name: string;
  html: string;
}

function looksLikeEncompassModelUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "encompass.com" ||
        parsed.hostname === "www.encompass.com") &&
      parsed.pathname.toLowerCase().includes("/model/")
    );
  } catch {
    return false;
  }
}

function isEncompassVariationUrl(url: string): boolean {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
    return modelIndex !== -1 && parts.length >= modelIndex + 2;
  } catch {
    return false;
  }
}

function extractEncompassVariationCodeFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p.toLowerCase() === "model");
    if (modelIndex !== -1 && parts.length >= modelIndex + 3) {
      return cleanText(parts[modelIndex + 2]).toUpperCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function buildEncompassQueries(model: string): string[] {
  const normalized = normalizeModel(model);
  return [
    `site:encompass.com/model "${normalized}"`,
    `site:encompass.com "${normalized}" "Parts List"`,
  ];
}

function encompassLandingHasMultipleVariations(text: string): boolean {
  const upper = text.toUpperCase();
  return (
    upper.includes("THIS MODEL HAS MULTIPLE VARIATIONS") ||
    upper.includes("PLEASE CHOOSE YOUR VERSION")
  );
}

function encompassLandingHasPartsList(text: string): boolean {
  const upper = text.toUpperCase();
  return (
    upper.includes("PARTS LIST") &&
    upper.includes("PART NUMBER") &&
    upper.includes("DESCRIPTION")
  );
}

function parseEncompassRowsFromTable(html: string): EncompassParsedRow[] {
  const $ = load(html);
  const rows: EncompassParsedRow[] = [];

  $("table").each((_, table) => {
    const headerCells = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((__, cell) => cleanText($(cell).text()).toLowerCase())
      .get();

    const headerText = headerCells.join(" | ");
    const hasRef = headerText.includes("ref #") || headerText.includes("ref#") || headerText.includes("image #");
    const hasPartNumber = headerText.includes("part number") || headerText.includes("part #") || headerText.includes("model part");
    const hasDescription = headerText.includes("description") || headerText.includes("desc") || headerText.includes("part name");

    if (!hasPartNumber || !hasDescription) return;

    // Identify column indices
    const refIdx = headerCells.findIndex(h => h.includes("ref #") || h.includes("ref#") || h.includes("image #"));
    const partIdx = headerCells.findIndex(h => h.includes("part number") || h.includes("part #") || h.includes("model part"));
    const descIdx = headerCells.findIndex(h => h.includes("description") || h.includes("desc") || h.includes("part name"));

    $(table)
      .find("tr")
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => cleanText($(td).text()))
          .get();

        if (cells.length < 2) return;

        const refNumber = refIdx !== -1 ? cells[refIdx] : "";
        const partNumber = (cells[partIdx] || "").toUpperCase();
        const description = cells[descIdx] || "";
        const tail = cells.join(" ");

        if (!partNumber || !description) return;
        if (!/^[A-Z0-9-]{4,}$/.test(partNumber)) return;

        // Try to find section name from preceding header or sibling elements if not in table
        let sectionName = "All Model Parts";
        const precedingH3 = $(table).prevAll("h3, h4, h2").first().text();
        if (precedingH3) sectionName = cleanText(precedingH3);

        rows.push({
          sectionName,
          partNumber,
          description,
          diagramNumber: refNumber,
          nlaStatus: /\bNo\b/i.test(tail) && !/\bIn Stock\b/i.test(tail),
        });
      });
  });

  return uniqueBy(rows, (row) => `${row.sectionName}|${row.partNumber}`);
}

function parseEncompassRows(input: EncompassParseRowsInput): EncompassParsedRow[] {
  return parseEncompassRowsFromTable(input.html);
}

async function fetchEncompassSources(input: ProviderInput): Promise<RetrievedSource[]> {
  const model = normalizeModel(input.model);
  const brand = normalizeBrand(input.brand ?? "");
  
  if (!model || !brand) return [];

  const modelUrl = buildEncompassUrl({ brand, model });
  let html: string | null = null;
  let resolvedUrl = modelUrl;

  if (modelUrl) {
    try {
      html = await fetchHtml(modelUrl);
      if (!html.toUpperCase().includes(model)) {
        html = null;
      }
    } catch {
      html = null;
    }
  }

  // If model page failed or didn't resolve, try targeted search for Exploded View
  if (!html) {
    // extract prefix if possible
    let mfgCode = "WHI"; 
    const b = brand.toLowerCase();
    if (b.includes("ge") || b.includes("hotpoint") || b.includes("haier") || b.includes("monogram")) mfgCode = "HOT";
    else if (b.includes("whirlpool") || b.includes("maytag") || b.includes("kitchenaid") || b.includes("amana") || b.includes("jennair")) mfgCode = "WHI";
    else mfgCode = ""; // Fallback to broad search for LG/Samsung

    const searchResolution = await resolveExactModelUrl({
      model,
      domain: "encompass.com",
      brand,
      preferredQueries: [
        `site:encompass.com/model/${mfgCode} "${model}"`,
        `site:encompass.com "${mfgCode}${model}"`
      ]
    });

    if (searchResolution?.url) {
      resolvedUrl = searchResolution.url;
      try {
        html = await fetchHtml(resolvedUrl);
      } catch {
        return [];
      }
    }
  }

  if (!html || !resolvedUrl) return [];

  const $ = load(html);
  
  // Case A: We are on an Exploded View page
  if (resolvedUrl.includes("/Exploded-View-Assembly/")) {
    return extractFromEncompassExplodedView(html, resolvedUrl, model);
  }

  // Case B: We are on a Model page, look for Exploded View link
  const explodedViewLink = $('a[href*="/Exploded-View-Assembly/"]').first();
    const href = explodedViewLink.attr("href");
    if (href) {
      const explodedUrl = absoluteUrl(resolvedUrl, href);
      try {
        const explodedHtml = await fetchHtml(explodedUrl);
        return extractFromEncompassExplodedView(explodedHtml, explodedUrl, model);
      } catch {
        // fallback to model page parsing
      }
    }

  // Case C: Fallback to model page parts table
  const rows = parseEncompassRowsFromTable(html);
  if (rows.length > 0) {
    return [{
      sourceUrl: resolvedUrl,
      sourceType: "distributor",
      provider: "encompass-family",
      sectionName: "All Model Parts",
      text: [
        "SOURCE_PROVIDER: encompass-family",
        `MODEL: ${model}`,
        "SECTION: All Model Parts",
        ...rows.map(r => `ROW|diagram_number=${r.partNumber}|description=${r.description}|original_part_number=|current_service_part_number=${r.partNumber}|nla_status=${r.nlaStatus}|replacement_note=`)
      ].join("\n"),
      meta: { deterministic: true }
    }];
  }

  return [];
}

async function extractFromEncompassExplodedView(
  html: string,
  url: string,
  model: string
): Promise<RetrievedSource[]> {
  const $ = load(html);
  const parsedUrl = parseEncompassExplodedViewUrl(url);
  
  // In Exploded View pages, there are often multiple sections shown as thumbnails or tabs
  const sections: EncompassSection[] = [];
  
  // Simplified for now: treat the whole page as one if no explicit tabs found, 
  // or look for section identifiers in the parts table
  const rows = parseEncompassRowsFromTable(html);
  if (!rows.length) return [];

  // Group by section
  const groups = uniqueBy(rows, r => r.sectionName).map(s => s.sectionName);
  
  return groups.map(sectionName => {
    const sectionRows = rows.filter(r => r.sectionName === sectionName);
    return {
      sourceUrl: url,
      sourceType: "oem", // Exploded views are effectively OEM-tier schematics
      provider: "encompass-family",
      sectionName: sectionName || "All Model Parts",
      text: [
        "SOURCE_PROVIDER: encompass-family",
        `MODEL: ${model}`,
        `SECTION: ${sectionName || "All Model Parts"}`,
        ...sectionRows.map(r => `ROW|diagram_number=${r.partNumber}|description=${r.description}|original_part_number=|current_service_part_number=${r.partNumber}|nla_status=${r.nlaStatus}|replacement_note=`)
      ].join("\n"),
      meta: { 
        mfgCode: parsedUrl?.mfgCode,
        assemblyId: parsedUrl?.assemblyId,
        isExplodedView: true
      }
    };
  });
}

export const encompassFamilyProvider = createEncompassBackedFamilyProvider({
  name: "encompass-family",
  priority: 25,
  domain: "encompass.com",
  brandNames: [
    "Haier",
    "Samsung",
    "LG",
    "Sony",
    "Panasonic",
    "Vizio",
    "Toshiba",
    "Sharp",
    "Kenmore",
    "Whirlpool",
    "Maytag",
    "KitchenAid",
    "Amana",
    "Jenn-Air",
    "Magic Chef",
    "Admiral",
    "Norge",
    "Roper",
  ],
  replacementNoteDefault: "Authorized Encompass parts list",
  sourceSurfaceLabel: "encompass-distributor",
  buildPreferredQueries: buildEncompassQueries,
  looksLikeModelUrl: looksLikeEncompassModelUrl,
  isVariationUrl: isEncompassVariationUrl,
  extractVariationCodeFromUrl: extractEncompassVariationCodeFromUrl,
  landingHasMultipleVariations: encompassLandingHasMultipleVariations,
  landingHasPartsList: encompassLandingHasPartsList,
  parseVariationLinks(input) {
    return defaultParseVariationLinks({
      modelUrl: input.modelUrl,
      html: input.html,
      model: input.model,
      looksLikeModelUrl: looksLikeEncompassModelUrl,
      isVariationUrl: isEncompassVariationUrl,
      extractVariationCodeFromUrl: extractEncompassVariationCodeFromUrl,
    });
  },
  parseRows: parseEncompassRows,
});

// Hook up deterministic fetcher before search-based factory fetcher
const originalFetchSources = encompassFamilyProvider.fetchSources;
encompassFamilyProvider.fetchSources = async (input: ProviderInput): Promise<RetrievedSource[]> => {
  const deterministicSources = await fetchEncompassSources(input);
  if (deterministicSources.length > 0) {
    return deterministicSources;
  }
  return originalFetchSources(input);
};
