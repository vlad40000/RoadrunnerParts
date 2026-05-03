import "server-only";

import { load } from "cheerio";
import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
  type EncompassParsedRow,
} from "./encompass-backed-family";
import type { RetrievedSource, SourceProvider } from "./types";
import { cleanText, fetchHtml, htmlToText, normalizeModel, uniqueBy } from "./utils";

/**
 * Universal brand-to-code mapping for Encompass Exploded View search.
 * Extracted from confirmed encompass_route files.
 */
export const ENCOMPASS_BRAND_MAP: Record<string, { code: string; name: string }> = {
  "whirlpool": { code: "whi", name: "Whirlpool" },
  "aeon air": { code: "anr", name: "Aeon_Air" },
  "avanti": { code: "AVA", name: "Avanti" },
  "bertazzoni": { code: "brt", name: "Bertazzoni" },
  "beko": { code: "bek", name: "Beko" },
  "blomberg": { code: "blm", name: "Blomberg" },
  "bosch": { code: "bch", name: "Bosch" },
  "breville": { code: "bre", name: "Breville" },
  "criterion": { code: "cri", name: "Criterion" },
  "dacor": { code: "dac", name: "Dacor" },
  "danby": { code: "dby", name: "Danby" },
  "de'longhi": { code: "dei", name: "De'Longhi" },
  "elica": { code: "eli", name: "Elica" },
  "electrolux": { code: "fri", name: "Electrolux" },
  "frigidaire": { code: "fri", name: "Frigidaire" },
  "element": { code: "ele", name: "Element" },
  "fisher paykel": { code: "fap", name: "Fisher_Paykel" },
  "hotpoint": { code: "hot", name: "HotPoint" },
  "haier": { code: "hai", name: "Haier" },
  "hestan": { code: "HES", name: "Hestan" },
  "ikea": { code: "ikea", name: "IKEA" },
  "kenmore": { code: "kmr", name: "Kenmore" },
  "lg": { code: "lge", name: "LG" },
  "lge": { code: "lge", name: "LG" }, // Handle normalized form
  "liebherr": { code: "lie", name: "Liebherr" },
  "magic chef": { code: "mac", name: "MagicChef" },
  "maytag": { code: "may", name: "Maytag" },
  "middleby": { code: "mby", name: "Middleby" },
  "midea": { code: "MID", name: "Midea" },
  "miele": { code: "MIE", name: "Miele" },
  "samsung": { code: "smg", name: "Samsung" },
  "sharp": { code: "sha", name: "Sharp" },
  "silhouette": { code: "sil", name: "Silhouette" },
  "smeg": { code: "sgg", name: "Smeg" },
  "speed queen": { code: "SPQ", name: "Speed-Queen" },
  "viking": { code: "vik", name: "Viking" },
  "vulcan": { code: "vul", name: "Vulcan" },
};

function getEncompassBrandInfo(brand: string | null | undefined) {
  const normalized = (brand || "").trim().toLowerCase();
  return ENCOMPASS_BRAND_MAP[normalized] || null;
}

function looksLikeEncompassModelUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "encompass.com" || parsed.hostname.endsWith(".encompass.com")) &&
      (parsed.pathname.toLowerCase().includes("/model/") || parsed.pathname.toLowerCase().includes("/item/"))
    );
  } catch {
    return false;
  }
}

function isEncompassVariationUrl(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const parts = path.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p === "model");
    return modelIndex !== -1 && parts.length >= modelIndex + 3;
  } catch {
    return false;
  }
}

function extractEncompassVariationCodeFromUrl(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const parts = path.split("/").filter(Boolean);
    const modelIndex = parts.findIndex((p) => p === "model");
    if (modelIndex !== -1 && parts.length >= modelIndex + 3) {
      return cleanText(parts[modelIndex + 2]).toUpperCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function buildEncompassQueries(model: string, brand: string | null | undefined) {
  const normalized = normalizeModel(model);
  const info = getEncompassBrandInfo(brand);
  
  if (!info) {
    return [`site:encompass.com/model "${normalized}"`];
  }

  return [
    `site:encompass.com/model/${info.code}/${info.name} "${normalized}"`,
    `site:encompass.com/model "${normalized}" "${info.name}"`,
    `site:encompass.com/model "${normalized}"`,
  ];
}

function parseEncompassRowsFromTable(html: string): EncompassParsedRow[] {
  const $ = load(html);
  const rows: EncompassParsedRow[] = [];

  // Identify the model being viewed to ensure rows are relevant
  const modelMatch = html.match(/Parts for Model ([A-Z0-9-]+)/i);
  const currentModel = modelMatch ? modelMatch[1].toUpperCase() : null;

  $("table").each((_, table) => {
    const headerCells = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((__, cell) => cleanText($(cell).text()).toLowerCase())
      .get();

    const headerText = headerCells.join(" | ");
    const looksLikePartsTable =
      (headerText.includes("category") || headerText.includes("section") || headerText.includes("assembly")) &&
      headerText.includes("part number") &&
      headerText.includes("description");

    if (!looksLikePartsTable) return;

    // Determine column indices
    const sectionIdx = headerCells.findIndex(h => h.includes("category") || h.includes("section") || h.includes("assembly"));
    const partIdx = headerCells.findIndex(h => h.includes("part number"));
    const descIdx = headerCells.findIndex(h => h.includes("description"));

    $(table)
      .find("tr")
      .slice(1)
      .each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => cleanText($(td).text()))
          .get();

        if (cells.length < 3) return;

        const sectionName = cells[sectionIdx] || "Miscellaneous";
        const partNumber = (cells[partIdx] || "").toUpperCase();
        const description = cells[descIdx] || "";
        const tail = cells.join(" ");

        if (!partNumber || !description) return;
        if (!/^[A-Z0-9-]{4,}$/.test(partNumber)) return;

        rows.push({
          sectionName,
          partNumber,
          description,
          nlaStatus: /\bNo\b/i.test(tail) && !/\bIn Stock\b/i.test(tail),
        });
      });
  });

  return uniqueBy(rows, (row) => `${row.sectionName}|${row.partNumber}`);
}

function parseEncompassAssemblyLinks(html: string, baseUrl: string) {
  const $ = load(html);
  const links: { url: string; name: string }[] = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const text = cleanText($(el).text());
    if (href && href.toLowerCase().includes("/exploded-view-assembly/") && text) {
      links.push({
        url: new URL(href, baseUrl).toString(),
        name: text
      });
    }
  });

  return uniqueBy(links, l => l.url);
}

function parseEncompassPartCount(html: string): number | null {
  const match = html.match(/(\d+)\s+Part Count/i) || html.match(/Found\s+(\d+)\s+parts/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseEncompassRows(input: {
  html: string;
  text: string;
  model: string;
  variationUrl: string;
  variationCode: string | null;
}) {
  return parseEncompassRowsFromTable(input.html);
}

const baseProvider = createEncompassBackedFamilyProvider({
  name: "encompass-universal",
  priority: 15,
  domain: "encompass.com",
  brandNames: Object.keys(ENCOMPASS_BRAND_MAP),
  replacementNoteDefault: "Authorized Encompass Replacement Part",
  sourceSurfaceLabel: "encompass",
  buildPreferredQueries: (model: string) => buildEncompassQueries(model, "unknown"),
  looksLikeModelUrl: looksLikeEncompassModelUrl,
  isVariationUrl: isEncompassVariationUrl,
  extractVariationCodeFromUrl: extractEncompassVariationCodeFromUrl,
  landingHasMultipleVariations: (text: string) => {
    const upper = text.toUpperCase();
    return (
      upper.includes("THIS MODEL HAS MULTIPLE VARIATIONS") ||
      upper.includes("PLEASE CHOOSE YOUR VERSION")
    );
  },
  landingHasPartsList: (text: string) => {
    const upper = text.toUpperCase();
    return (
      upper.includes("PARTS LIST") ||
      upper.includes("PART NUMBER") ||
      upper.includes("EXPLODED VIEW ASSEMBLY")
    );
  },
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

export const encompassUniversalProvider: SourceProvider = {
  ...baseProvider,
  async fetchSources(input) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const brandInfo = getEncompassBrandInfo(input.brand);
    if (brandInfo) {
      // Step 1: Attempt Direct Path (New Path Strategy)
      const directUrl = `https://encompass.com/model/${brandInfo.code}/${brandInfo.name}/${model}`;
      console.log(`[Encompass Universal] Attempting direct path: ${directUrl}`);
      
      try {
        const html = await fetchHtml(directUrl);
        const text = htmlToText(html);

        if (text.toUpperCase().includes(model)) {
          console.log(`[Encompass Universal] Direct path success for ${model}`);
          
          // Identify if it's a variation landing page or a parts list
          if (baseProvider.landingHasMultipleVariations(text)) {
            const variationLinks = baseProvider.parseVariationLinks!({
              modelUrl: directUrl,
              html,
              model,
            });
            
            if (variationLinks.length) {
              // Recurse using base variation fetcher logic if needed, 
              // or just return from here using our logic.
              // For simplicity, we'll let the base provider handle the variations if we return the landing page.
            }
          }

          // If it has assembly links, we should fetch those as well to be exhaustive
          const assemblyLinks = parseEncompassAssemblyLinks(html, directUrl);
          const partCount = parseEncompassPartCount(text);
          
          console.log(`[Encompass Universal] Found ${assemblyLinks.length} assemblies and ${partCount || 'unknown'} part count.`);

          if (assemblyLinks.length > 0) {
            const results: RetrievedSource[] = [];
            
            // Fetch first few assemblies (exhaustive but capped for performance)
            for (const assembly of assemblyLinks.slice(0, 15)) {
              try {
                const assemblyHtml = await fetchHtml(assembly.url);
                const assemblyText = htmlToText(assemblyHtml);
                const rows = parseEncompassRowsFromTable(assemblyHtml);
                
                if (rows.length > 0) {
                  results.push({
                    sourceUrl: assembly.url,
                    sourceType: "oem",
                    provider: "encompass-universal",
                    sectionName: assembly.name,
                    text: `SOURCE_PROVIDER: encompass-universal\nMODEL: ${model}\nSECTION: ${assembly.name}\n` + 
                          rows.map(r => `ROW|diagram_number=${r.partNumber}|description=${r.description}|original_part_number=${r.partNumber}|current_service_part_number=${r.partNumber}|nla_status=${r.nlaStatus}`).join("\n"),
                    meta: { rowCount: rows.length, partCountTarget: partCount }
                  });
                }
              } catch (err) {
                console.warn(`[Encompass Universal] Failed to fetch assembly ${assembly.url}`);
              }
            }
            
            if (results.length > 0) return results;
          }
          
          // Fallback to base provider logic if no direct assemblies found but landing has parts
          if (baseProvider.landingHasPartsList(text)) {
             const rows = parseEncompassRowsFromTable(html);
             if (rows.length > 0) {
                return [{
                  sourceUrl: directUrl,
                  sourceType: "oem",
                  provider: "encompass-universal",
                  sectionName: "General Parts List",
                  text: `SOURCE_PROVIDER: encompass-universal\nMODEL: ${model}\nSECTION: General Parts List\n` + 
                        rows.map(r => `ROW|diagram_number=${r.partNumber}|description=${r.description}|original_part_number=${r.partNumber}|current_service_part_number=${r.partNumber}|nla_status=${r.nlaStatus}`).join("\n"),
                  meta: { rowCount: rows.length, partCountTarget: partCount }
                }];
             }
          }
        }
      } catch (err) {
        console.log(`[Encompass Universal] Direct path failed for ${model}, falling back to search.`);
      }
    }

    // Step 2: Fallback to Search Path (Original Logic)
    return baseProvider.fetchSources(input);
  }
};
