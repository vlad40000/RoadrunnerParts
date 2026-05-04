// import "server-only";
import { normalizeBrandLabel, normalizeSectionName } from "../../../identity/normalize";
import { load } from "cheerio";
import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  normalizeModel,
  uniqueBy,
  runWithConcurrency,
} from "./utils";
import {
  extractSearsCatalogPayload,
  parseSearsCatalogModel,
  parseSearsModelSearchPayload,
  parseSearsCatalogDiagrams,
  parseSearsCatalogParts,
  type SearsCatalogPart,
} from "./sears-catalog-adapter";

const FIX_BRAND_SLUGS: Record<string, string> = {
  GE: "general-electric",
  Hotpoint: "hotpoint",
  Haier: "haier",
  Monogram: "monogram",
  Whirlpool: "whirlpool",
  Maytag: "maytag",
  KitchenAid: "kitchenaid",
  Frigidaire: "frigidaire",
  Electrolux: "electrolux",
  LG: "lg",
  Samsung: "samsung",
  Bosch: "bosch",
};

const FIX_APPLIANCE_SLUGS: Record<string, string> = {
  washer: "washer",
  washing_machine: "washer",
  dryer: "dryer",
  dishwasher: "dishwasher",
  refrigerator: "refrigerator",
  range: "range",
  oven: "range",
  microwave: "microwave",
};

export function buildFixModelUrl(input: {
  brand: string;
  applianceType: string;
  model: string;
}): string {
  const brand = input.brand || "Appliance";
  const brandSlug =
    FIX_BRAND_SLUGS[brand] ||
    brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const applianceSlug =
    FIX_APPLIANCE_SLUGS[input.applianceType.trim().toLowerCase()] ||
    input.applianceType.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return `https://www.fix.com/models/${applianceSlug}/${brandSlug}/${input.model.toUpperCase()}/`;
}

export interface SearsParsedRow {
  sectionName: string;
  diagramNumber: string;
  description: string;
  originalPartNumber: string | null;
  currentServicePartNumber: string | null;
  nlaStatus: boolean;
  replacementNote: string | null;
}

export async function resolveSearsModelPartCount(input: {
  model: string;
  brand?: string | null;
}) {
  const model = normalizeModel(input.model);
  const searchUrl = `https://www.searspartsdirect.com/search?q=${encodeURIComponent(model)}`;
  
  try {
    const html = await fetchHtml(searchUrl);
    const payload = extractSearsCatalogPayload(html);

    if (payload) {
      if (payload.models?.items) {
        const models = parseSearsModelSearchPayload(payload);
        const exact = models.find(m => normalizeModel(m.modelNumber) === model);
        if (exact?.partCount) {
          console.log(`[Sears Adapter] Found authoritative part count for ${model} via Listing Payload: ${exact.partCount}`);
          return exact.partCount;
        }
      }
      
      const catalogModel = parseSearsCatalogModel(payload);
      if (catalogModel?.partCount) {
        console.log(`[Sears Adapter] Found authoritative part count for ${model} via Detail Payload: ${catalogModel.partCount}`);
        return catalogModel.partCount;
      }
    }

    const $ = load(html);
    
    let count: number | null = null;
    const modelsCountText = $(".models__count, .parts-count, .count, .model-parts-count").first().text().trim();
    if (modelsCountText) {
      const match = modelsCountText.match(/(\d+)\s*parts/i);
      if (match) {
        count = parseInt(match[1], 10);
      }
    }

    if (count === null) {
      $(".model-card, .search-result-card, .product-card, .search-result-item, .search-result-item-container").each((_, el) => {
        const $card = $(el);
        const cardText = $card.text().trim();
        if (cardText.toUpperCase().includes(model.toUpperCase())) {
          const match = cardText.match(/(\d+)\s*(?:parts|items|components)/i);
          if (match) {
            count = parseInt(match[1], 10);
            if (cardText.toUpperCase().includes("EXACT MATCH")) return false;
          }
        }
      });
    }

    return count;
  } catch (err) {
    console.warn(`[Sears Scraper] Failed to fetch model part count for ${model}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function resolveSearsModelUrl(input: {
  model: string;
  brand?: string | null;
  productType?: string | null;
}) {
  const model = normalizeModel(input.model);
  const brand = cleanText(input.brand);
  const productType = cleanText(input.productType);

  return resolveExactModelUrl({
    model,
    domain: "searspartsdirect.com",
    preferredQueries: [
      `site:searspartsdirect.com "${model}" "By Schematic"`,
      `site:searspartsdirect.com "${model}" "SELECT DIAGRAM"`,
      `site:searspartsdirect.com "${model}" "All Model Parts"`,
      brand ? `site:searspartsdirect.com "${model}" "${brand}"` : "",
      productType ? `site:searspartsdirect.com "${model}" "${productType}" parts` : "",
    ].filter(Boolean),
  });
}

function htmlToLines(html: string) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();

  const raw = $("body").text();

  return raw
    .split(/\r?\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function isPaginationMarker(line: string) {
  return /^Page \d+ of \d+$/i.test(line);
}

function isStopLine(line: string) {
  return (
    /^Most common symptoms/i.test(line) ||
    /^Most common repair guides/i.test(line) ||
    /^Effective articles/i.test(line) ||
    /^Parts & More$/i.test(line) ||
    /^Quick links$/i.test(line)
  );
}

function isDiagramHeading(line: string) {
  const s = line.toLowerCase();
  // Standard markers
  if (/(?:diagram|parts diagram|schematic|assembly)$/i.test(s)) return true;
  // Laundry taxonomy keywords from research report
  if (/(?:console|cabinet|door|drum|tub|basket|agitator|bulkhead|motor|belt|burner|heater|dispenser|wiring|meter|labels)/i.test(s)) {
    return true;
  }
  return false;
}


function isMetadataLine(line: string) {
  return (
    /^By Schematic$/i.test(line) ||
    /^By Part$/i.test(line) ||
    /^SELECT DIAGRAM$/i.test(line) ||
    /^All Model Parts$/i.test(line) ||
    /^Browse Parts for /i.test(line) ||
    /^Qty$/i.test(line) ||
    /^Add to cart$/i.test(line) ||
    /^In Stock$/i.test(line) ||
    /^Backorder$/i.test(line) ||
    /^Special Order$/i.test(line) ||
    /^This item is not returnable$/i.test(line) ||
    /^Manufacturer substitution$/i.test(line) ||
    /^\$\d/.test(line) ||
    /^Part|Number|#|No\s*[:#]?\s*[A-Z0-9-]+$/i.test(line) ||
    /^Replaced by|Substitution\s*[:#]?\s*[A-Z0-9-]+$/i.test(line) ||
    /^The manufacturer no longer makes this part/i.test(line) ||
    /^(?:This part replaces|Replaces)\b/i.test(line) ||
    /^This is the number corresponding to the part on the diagram/i.test(line) ||
    /^Model #/i.test(line) ||
    /^Here are the diagrams and repair parts for /i.test(line) ||
    /^Official /i.test(line)
  );
}

function parseReplacementLine(line: string) {
  const replaced = line.match(/^Replaced by #\s*([A-Z0-9-]+)$/i);
  if (replaced?.[1]) {
    return replaced[1].toUpperCase();
  }
  return null;
}

function parsePartNumberLine(line: string) {
  const match = line.match(/(?:Part|Number|#|No)\s*[:#]?\s*([A-Z0-9-]+)$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function parseDiagramNumberLine(line: string) {
  const match = line.match(/^(?:#|Ref|Item)\s*([0-9A-Z]+)$/i) || line.match(/^([0-9A-Z]+)$/i);
  return match?.[1] ?? null;
}

function parseRowsFromHtml(html: string) {
  const $ = load(html);
  const rows: SearsParsedRow[] = [];

  // Determine current section
  let currentSectionName = "All Model Parts";
  const h1Text = cleanText($("h1").text());
  if (h1Text && h1Text !== "SELECT DIAGRAM") {
    currentSectionName = normalizeSectionName(h1Text);
  }

  // Look for the "By Schematic" sections list to refine section name if needed
  $(".breadcrumb-item.active, .diagram-name, .model-section-title, .active-section").each((_, el) => {
    const text = cleanText($(el).text());
    if (text && text.length > 2 && !isMetadataLine(text)) {
      currentSectionName = normalizeSectionName(text);
    }
  });

  // Extract from grid/list items (Sears Modern Layout)
  $(".part-list-item, .part-item-container, .part-row, [data-test='part-item'], .pd-part-tile").each((_, el) => {
    const $item = $(el);
    const partNumber = parsePartNumberLine(cleanText($item.find(".part-number, .part-no, .pd-part-number, [data-test='part-number']").text()));
    const diagramNumber = parseDiagramNumberLine(cleanText($item.find(".key-number, .callout-number, .pd-key-number").text()));
    const description = cleanText($item.find(".part-description, .part-name, a[href*='/part/'], [data-test='part-link']").first().text()) || "Appliance Part";
    
    if (partNumber) {
      let replacementPartNumber: string | null = null;
      let nlaStatus = false;
      let replacementNote: string | null = null;

      const replacementText = cleanText($item.find(".replacement-part, .replaced-by").text());
      if (replacementText) {
        replacementPartNumber = parseReplacementLine(replacementText);
        replacementNote = "Manufacturer substitution";
      }

      const statusText = cleanText($item.find(".status-message, .availability").text());
      if (/no longer makes/i.test(statusText)) {
        nlaStatus = true;
        replacementNote = "No substitute part";
      }

      rows.push({
        sectionName: currentSectionName,
        diagramNumber: diagramNumber || partNumber,
        description,
        originalPartNumber: partNumber,
        currentServicePartNumber: replacementPartNumber || partNumber,
        nlaStatus,
        replacementNote,
      });
    }
  });

  return rows;
}

function parseRowsFromLines(lines: string[]) {
  const rows: SearsParsedRow[] = [];

  const browseStart = lines.findIndex((line) => /^Browse Parts for /i.test(line));
  const startIndex = browseStart >= 0 ? browseStart : 0;

  let currentSectionName = "All Model Parts";
  let pendingDiagramNumber: string | null = null;
  let previousContentLine = "";

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (isStopLine(line)) break;

    const diagramNumber = parseDiagramNumberLine(line);
    if (diagramNumber) {
      pendingDiagramNumber = diagramNumber;
      continue;
    }

    if (isDiagramHeading(line)) {
      currentSectionName = normalizeSectionName(line) || currentSectionName;
      continue;
    }

    const partNumber = parsePartNumberLine(line);
    if (partNumber) {
      let replacementPartNumber: string | null = null;
      let nlaStatus = false;
      let replacementNote: string | null = null;

      for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
        const lookahead = lines[j];
        if (!lookahead) continue;

        const replaced = parseReplacementLine(lookahead);
        if (replaced) {
          replacementPartNumber = replaced;
          replacementNote = "Manufacturer substitution";
        }

        if (/^Manufacturer substitution$/i.test(lookahead)) {
          replacementNote = "Manufacturer substitution";
        }

        if (/^The manufacturer no longer makes this part/i.test(lookahead)) {
          nlaStatus = true;
          replacementNote = "No substitute part";
        }

        if (parsePartNumberLine(lookahead) || parseDiagramNumberLine(lookahead)) {
          break;
        }
      }

      const description =
        previousContentLine &&
        !isMetadataLine(previousContentLine) &&
        !isDiagramHeading(previousContentLine)
          ? previousContentLine
          : "Appliance Part";

      rows.push({
        sectionName: currentSectionName || "All Model Parts",
        diagramNumber: pendingDiagramNumber || partNumber,
        description,
        originalPartNumber: partNumber,
        currentServicePartNumber: replacementPartNumber || partNumber,
        nlaStatus,
        replacementNote,
      });

      continue;
    }

    if (!isMetadataLine(line) && !isPaginationMarker(line)) {
      previousContentLine = line;
    }
  }

  return uniqueBy(
    rows.filter(
      (row) =>
        cleanText(row.sectionName) &&
        cleanText(row.description) &&
        cleanText(row.currentServicePartNumber || row.originalPartNumber),
    ),
    (row) =>
      [
        row.sectionName.toLowerCase(),
        row.diagramNumber.toLowerCase(),
        (row.currentServicePartNumber || row.originalPartNumber || "").toLowerCase(),
        row.description.toLowerCase(),
      ].join("|"),
  );
}

function groupRowsBySection(rows: SearsParsedRow[]) {
  const map = new Map<string, SearsParsedRow[]>();

  for (const row of rows) {
    const sectionName = cleanText(row.sectionName) || "All Model Parts";
    if (!map.has(sectionName)) {
      map.set(sectionName, []);
    }
    map.get(sectionName)!.push(row);
  }

  return Array.from(map.entries()).map(([sectionName, groupedRows]) => ({
    sectionName,
    rows: uniqueBy(
      groupedRows,
      (row) =>
        `${row.diagramNumber}|${row.currentServicePartNumber || row.originalPartNumber}|${row.description}`,
    ),
  }));
}

function rowsToStructuredText(input: {
  model: string;
  sectionName: string;
  rows: SearsParsedRow[];
}) {
  const lines = [
    `SOURCE_PROVIDER: sears-partsdirect`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
  ];

  for (const row of input.rows) {
    lines.push(
      [
        "ROW",
        `diagram_number=${row.diagramNumber}`,
        `description=${row.description}`,
        `original_part_number=${row.originalPartNumber ?? ""}`,
        `current_service_part_number=${row.currentServicePartNumber ?? ""}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

function collectPaginationUrls(html: string, currentUrl: string) {
  const $ = load(html);
  const current = new URL(currentUrl);

  const urls = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href || !text) return null;
      if (!/^\d+$/.test(text)) return null;

      const abs = absoluteUrl(currentUrl, href);

      try {
        const parsed = new URL(abs);
        if (parsed.hostname !== current.hostname) return null;
        if (parsed.pathname !== current.pathname) return null;
        if (abs === currentUrl) return null;
        return abs;
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean) as string[];

  return uniqueBy(urls, (url) => url).slice(0, 7);
}

function buildDeterministicSearsModelPageUrls(currentUrl: string, maxPage: number) {
  try {
    const parsed = new URL(currentUrl);
    const isSears = /(^|\.)searspartsdirect\.com$/i.test(parsed.hostname);
    const isModelPartsPath = /\/model\/.+-parts$/i.test(parsed.pathname);
    if (!isSears || !isModelPartsPath) return [];

    const urls: string[] = [];
    for (let page = 2; page <= maxPage; page += 1) {
      const next = new URL(currentUrl);
      next.searchParams.set("page", String(page));
      urls.push(next.toString());
    }
    return urls;
  } catch {
    return [];
  }
}

async function fetchAndParseSearsPage(url: string, modelNumber: string) {
  const html = await fetchHtml(url);
  const payload = extractSearsCatalogPayload(html);

  if (payload) {
    console.log(`[Sears Adapter] Found authoritative CATALOG_API_RESPONSE for ${modelNumber}`);
    
    if (payload.modelDetails) {
      const diagrams = parseSearsCatalogDiagrams(payload);
      const catalogParts = parseSearsCatalogParts(payload);
      const catalogModel = parseSearsCatalogModel(payload);

      const rows: (SearsParsedRow & { price?: number | null })[] = catalogParts.map(p => ({
        sectionName: "All Model Parts",
        diagramNumber: p.diagramNumber,
        description: p.description,
        originalPartNumber: p.originalPartNumber,
        currentServicePartNumber: p.currentServicePartNumber,
        nlaStatus: p.availability?.toLowerCase().includes("no longer available") || false,
        replacementNote: p.replacementNote || null,
        price: p.price,
      }));

      return { 
        html, 
        lines: [], 
        rows,
        diagrams,
        catalogModel,
        type: 'detail' as const
      };
    }

    if (payload.models?.items) {
      const models = parseSearsModelSearchPayload(payload);
      return { 
        html, 
        lines: [], 
        rows: [], 
        searchModels: models,
        type: 'listing' as const
      };
    }
  }

  const rowsFromDom = parseRowsFromHtml(html);
  const lines = htmlToLines(html);
  const rowsFromLines = parseRowsFromLines(lines);
  
  const merged = uniqueBy(
    [...rowsFromDom, ...rowsFromLines],
    (row) => `${row.sectionName}|${row.diagramNumber}|${row.currentServicePartNumber || row.originalPartNumber}|${row.description}`
  );

  return { html, lines, rows: merged, type: 'legacy' as const };
}

export const searsPartsDirectProvider: SourceProvider = {
  name: "sears-partsdirect",
  priority: 5,

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput & { productType?: string | null }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const resolution = await resolveSearsModelUrl({
      model,
      brand: input.brand,
      productType: input.productType,
    });

    if (!resolution?.url) return [];
    const url = resolution.url;

    const mergedRows: (SearsParsedRow & { price?: number | null })[] = [];
    const visited = new Set<string>();

    const first = await fetchAndParseSearsPage(url, model);
    mergedRows.push(...first.rows);
    visited.add(url);

    // If authoritative payload gave us the part count, use it
    const expectedPartsTotal = (first as any).catalogModel?.partCount || null;

    const pageCapRaw = Number(process.env.SEARS_MAX_MODEL_PAGE || "9");
    const pageCap = Number.isFinite(pageCapRaw) ? Math.max(2, Math.min(20, Math.floor(pageCapRaw))) : 9;

    const discoveredPages =
      first.lines.some((line) => isPaginationMarker(line))
        ? collectPaginationUrls(first.html, url)
        : [];
    const deterministicPages = buildDeterministicSearsModelPageUrls(url, pageCap);
    const extraPages = uniqueBy([...discoveredPages, ...deterministicPages], (nextUrl) => nextUrl);

    // Parallel fetch with concurrency limit of 3 to avoid aggressive blocking
    const pageResults = await runWithConcurrency(
      extraPages.filter(nextUrl => !visited.has(nextUrl)),
      process.env.BOM_PROVIDER_CONCURRENCY ? parseInt(process.env.BOM_PROVIDER_CONCURRENCY, 10) : 3,
      async (nextUrl) => {
        visited.add(nextUrl);
        try {
          return await fetchAndParseSearsPage(nextUrl, model);
        } catch (err) {
          console.error(`[Sears] Failed to fetch page ${nextUrl}:`, err);
          return null;
        }
      }
    );

    for (const res of pageResults) {
      if (res) mergedRows.push(...res.rows);
    }

    const rows = uniqueBy(
      mergedRows,
      (row) =>
        `${row.sectionName}|${row.diagramNumber}|${row.currentServicePartNumber || row.originalPartNumber}|${row.description}`,
    );

    if (rows.length === 0) {
      return [
        {
          sourceUrl: url,
          sourceType: "distributor",
          provider: "sears-partsdirect",
          sectionName: "All Model Parts",
          sectionOriginal: "All Model Parts",
          text: `SOURCE_PROVIDER: sears-partsdirect\nMODEL: ${model}\nSECTION: All Model Parts\nRAW_CONTENT:\n${first.lines.join("\n")}`,
          meta: {
            rowCount: 0,
            parser: "sears-model-page-v2",
            expectedPartsTotal,
            expectedPartsSource: "searspartsdirect.com",
            ...resolution,
          },
        },
      ];
    }

    return groupRowsBySection(rows).map((group) => ({
      sourceUrl: url,
      sourceType: "distributor" as const,
      provider: "sears-partsdirect",
      sectionName: group.sectionName,
      sectionOriginal: group.sectionName,
      text: rowsToStructuredText({
        model,
        sectionName: group.sectionName,
        rows: group.rows,
      }),
      meta: {
        rowCount: group.rows.length,
        parser: first.type === 'detail' ? "sears-catalog-json-v1" : "sears-model-page-v2",
        expectedPartsTotal,
        expectedPartsSource: "searspartsdirect.com",
        ...resolution,
      },
    }));
  },
};
