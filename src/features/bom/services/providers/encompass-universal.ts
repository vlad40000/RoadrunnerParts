// import "server-only";

import { load } from "cheerio";
import {
  createEncompassBackedFamilyProvider,
  defaultParseVariationLinks,
  type EncompassParsedRow,
} from "./encompass-backed-family";
import type { RetrievedSource, SourceProvider } from "./types";
import { cleanText, fetchHtml, htmlToText, normalizeModel, uniqueBy } from "./utils";
import { resolveEncompassBrandRoute } from "../encompass-route-service";
import { logTelemetry } from "../telemetry";
import { buildEncompassAssemblyUrl } from "./deterministic-urls";

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

function buildEncompassQueries(model: string) {
  const normalized = normalizeModel(model);
  return [`site:encompass.com/model "${normalized}"`];
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
  brandNames: [], // Dynamically resolved via DB
  replacementNoteDefault: "Authorized Encompass Replacement Part",
  sourceSurfaceLabel: "encompass",
  buildPreferredQueries: (model: string) => buildEncompassQueries(model),
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
  supports(input) {
    const model = normalizeModel(input.model);
    if (!model) return false;
    // Encompass supports hundreds of brands; we let fetchSources handle the DB-backed validation
    return true;
  },
  async fetchSources(input) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    // 1. Try DB-first Route Resolution
    const brandRoute = input.brand ? await resolveEncompassBrandRoute(input.brand) : null;
    
    if (brandRoute) {
      // Step 1: Attempt Direct Assembly Path (Bypass Strategy)
      const directUrl = buildEncompassAssemblyUrl({
        abv: brandRoute.abv,
        targetBrand: brandRoute.targetBrand,
        model,
        pattern: brandRoute.explodedViewAssemblyUrlPattern
      });
      
      console.log(`[Encompass Universal] Attempting direct assembly path: ${directUrl}`);
      
      try {
        const html = await fetchHtml(directUrl, {
          jobId: input.jobId,
          brand: input.brand ?? undefined,
          model: model,
          provider: "encompass-universal"
        });
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
                const assemblyHtml = await fetchHtml(assembly.url, {
                  jobId: input.jobId,
                  brand: input.brand ?? undefined,
                  model: model,
                  provider: "encompass-universal"
                });
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
        const message = err instanceof Error ? err.message : String(err);
        if (/403|429/i.test(message)) {
          await logTelemetry({
            event: "encompass_hardened_path_blocked",
            status: "failed",
            model,
            brand: input.brand ?? undefined,
            payload: {
              provider: "encompass-universal",
              url: directUrl,
              reason: message,
            },
          });
        }
        console.log(`[Encompass Universal] Hardened path failed for ${model}, falling back to search.`);
      }
    }

    // Step 2: Fallback to Search Path (Original Logic)
    return baseProvider.fetchSources(input);
  }
};
