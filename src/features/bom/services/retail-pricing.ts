import "server-only";
import { load } from "cheerio";

import type { BomRow } from "../schemas/bom";
import {
  dedupeSearchHits,
  searchExistingGroundingLayer,
} from "./search/search-adapter";
import {
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeModel,
  runWithConcurrency,
  uniqueBy,
} from "./providers/utils";

type RetailPriceSnapshot = {
  status: "verified_price" | "encompass_no_price" | "fallback_verified_price" | "no_verified_price" | "ambiguous_match" | "blocked" | "source_error";
  retailPrice: number | null;
  retailPriceText: string | null;
  retailAvailability: string | null;
  retailPricingUrl: string | null;
  retailPriceSource: string | null;
  retailPriceVerified: boolean;
  retailPricedAt: string | null;
  matchType?: "exact_part_number";
  matchedPartNumber?: string;
};

function looksLikeSearsUrl(url: string | null | undefined) {
  try {
    const host = new URL(url ?? "").hostname.toLowerCase();
    return host.includes("searspartsdirect.com");
  } catch {
    return false;
  }
}

function looksLikeFixUrl(url: string | null | undefined) {
  try {
    const host = new URL(url ?? "").hostname.toLowerCase();
    return host.includes("fix.com");
  } catch {
    return false;
  }
}

function normalizePartNumber(value: string | null | undefined) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function getRowPartNumber(row: BomRow) {
  return normalizePartNumber(
    row.currentServicePartNumber || row.originalPartNumber,
  );
}

function looksLikeEncompassUrl(url: string | null | undefined) {
  try {
    const host = new URL(url ?? "").hostname.toLowerCase();
    return (
      host === "encompass.com" ||
      host === "www.encompass.com" ||
      host === "partstore.encompass.com" ||
      host.endsWith(".encompass.com")
    );
  } catch {
    return false;
  }
}

function parseMoney(raw: string | null | undefined) {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseAvailability(text: string) {
  const matchers = [
    /In Stock/gi,
    /Backorder/gi,
    /Special Order/gi,
    /Usually ships[^.]{0,80}/gi,
    /Ships in[^.]{0,80}/gi,
    /Unavailable/gi,
    /No Longer Available/gi,
  ];

  for (const matcher of matchers) {
    const match = text.match(matcher);
    if (match?.[0]) return cleanText(match[0]);
  }

  return null;
}

function extractPriceFromWindow(windowText: string) {
  const patterns = [
    /(?:sale price|our price|price|part price)\s*\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/i,
    /\$\s*([0-9][0-9,]*(?:\.\d{2})?)/,
    /(?:^|\s)([0-9][0-9,]*(?:\.\d{2}))(?=\s+(?:In Stock|Backorder|Ships in|Usually ships|Special Order|No Longer Available|Unavailable|Add to Cart))/i,
  ];

  for (const pattern of patterns) {
    const match = windowText.match(pattern);
    const parsed = parseMoney(match?.[1]);
    if (parsed !== null && parsed > 0) {
      return {
        value: parsed,
        text: `$${parsed.toFixed(2)}`,
      };
    }
  }

  return null;
}

function extractSnapshotFromPageText(input: {
  pageText: string;
  partNumber: string;
  pricingUrl: string;
}) {
  const haystack = input.pageText.toUpperCase();
  const token = input.partNumber.toUpperCase();

  let index = haystack.indexOf(token);
  let attempts = 0;

  while (index !== -1 && attempts < 6) {
    const start = Math.max(0, index - 500);
    const end = Math.min(input.pageText.length, index + 900);
    const windowText = input.pageText.slice(start, end);

    const price = extractPriceFromWindow(windowText);
    if (price) {
      return {
        status: "verified_price" as const,
        retailPrice: price.value,
        retailPriceText: price.text,
        retailAvailability: parseAvailability(windowText),
        retailPricingUrl: input.pricingUrl,
        retailPriceSource: "encompass.com",
        retailPriceVerified: true,
        retailPricedAt: new Date().toISOString(),
        matchType: "exact_part_number" as const,
        matchedPartNumber: input.partNumber,
      };
    }

    index = haystack.indexOf(token, index + token.length);
    attempts += 1;
  }

  return null;
}

const EXTRACTION_TARGETS = {
  encompass: {
    domain: "encompass.com",
    selectors: {
      partNumber: ".part-number-display, [itemprop='sku'], .partNumber",
      price: ".price, [itemprop='price'], .part-price",
      availability: ".availability, .stock-status"
    }
  },
  sears: {
    domain: "searspartsdirect.com",
    selectors: {
      partNumber: ".part-number-value, .part-no, .model-number",
      price: ".price-value, .part-price, .regular-price",
      availability: ".availability-status, .stock-message"
    }
  },
  fix: {
    domain: "fix.com",
    selectors: {
      partNumber: ".part-number, .sku, .p-no",
      price: ".part-price, .price, .our-price",
      availability: ".availability, .in-stock-msg"
    }
  },
  pool: {
    domain: "whirlpoolparts.com",
    selectors: {
      partNumber: ".part-number, .mfg-part-number, .sku",
      price: ".price, .part-price, .regular-price",
      availability: ".availability, .stock-status"
    }
  }
};

function extractStructuredData(html: string, targetKey: keyof typeof EXTRACTION_TARGETS) {
  const $ = load(html);
  const target = EXTRACTION_TARGETS[targetKey];
  
  const partNumber = cleanText($(target.selectors.partNumber).first().text());
  const priceText = cleanText($(target.selectors.price).first().text());
  const availability = cleanText($(target.selectors.availability).first().text());
  
  const priceValue = parseMoney(priceText);
  
  if (!partNumber && !priceValue) return null;
  
  return {
    partNumber,
    priceValue,
    priceText: priceText || (priceValue ? `$${priceValue.toFixed(2)}` : ""),
    availability: availability || null
  };
}

function extractSnapshotFromPage(input: {
  html: string;
  partNumber: string;
  pricingUrl: string;
  targetKey: keyof typeof EXTRACTION_TARGETS;
}) {
  const structured = extractStructuredData(input.html, input.targetKey);
  
  // If structured extraction finds the EXACT part number, use it
  if (structured && structured.partNumber.toUpperCase().includes(input.partNumber.toUpperCase())) {
    if (structured.priceValue && structured.priceValue > 0) {
      return {
        status: "verified_price" as const,
        retailPrice: structured.priceValue,
        retailPriceText: structured.priceText,
        retailAvailability: structured.availability,
        retailPricingUrl: input.pricingUrl,
        retailPriceSource: EXTRACTION_TARGETS[input.targetKey].domain,
        retailPriceVerified: true,
        retailPricedAt: new Date().toISOString(),
        matchType: "exact_part_number" as const,
        matchedPartNumber: structured.partNumber || input.partNumber,
      };
    }
  }

  // Fallback to legacy window-based extraction if structured fails or is incomplete
  const text = htmlToText(input.html);
  return extractSnapshotFromPageText({
    pageText: text,
    partNumber: input.partNumber,
    pricingUrl: input.pricingUrl,
  });
}

async function resolveEncompassPriceForPart(input: {
  model: string | null | undefined;
  partNumber: string;
}) {
  const model = normalizeModel(input.model ?? "");
  const baseModel = model.split("/")[0] ?? model;

  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: [
        `"${model}" "${input.partNumber}"`,
        `"${baseModel}" "${input.partNumber}"`,
        `"${input.partNumber}" "Encompass"`,
      ],
      domain: "encompass.com",
      maxResults: 6,
    }),
  );

  for (const hit of hits) {
    if (!looksLikeEncompassUrl(hit.url)) continue;

    try {
      const html = await fetchHtml(hit.url);
      const snapshot = extractSnapshotFromPage({
        html,
        partNumber: input.partNumber,
        pricingUrl: hit.url,
        targetKey: "encompass"
      });

      if (snapshot) return snapshot;
    } catch { /* continue */ }
  }

  return null;
}

async function resolveSearsPriceForPart(input: {
  model: string | null | undefined;
  partNumber: string;
}) {
  // Try direct search first
  const searchUrl = `https://www.searspartsdirect.com/search?q=${input.partNumber}`;
  try {
    const html = await fetchHtml(searchUrl);
    const snapshot = extractSnapshotFromPage({
      html,
      partNumber: input.partNumber,
      pricingUrl: searchUrl,
      targetKey: "sears"
    });
    
    if (snapshot) {
      return { ...snapshot, retailPriceSource: "searspartsdirect.com" as const };
    }
  } catch (err) {
    console.warn(`[Retail Pricing] Sears search failed for ${input.partNumber}:`, err instanceof Error ? err.message : String(err));
  }

  // Fallback to grounding layer search if direct search fails
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: [`site:searspartsdirect.com "${input.partNumber}"`],
      domain: "searspartsdirect.com",
      maxResults: 3,
    })
  );

  for (const hit of hits) {
    if (!looksLikeSearsUrl(hit.url)) continue;
    try {
      const html = await fetchHtml(hit.url);
      const snapshot = extractSnapshotFromPage({
        html,
        partNumber: input.partNumber,
        pricingUrl: hit.url,
        targetKey: "sears"
      });
      if (snapshot) {
        return { ...snapshot, retailPriceSource: "searspartsdirect.com" as const };
      }
    } catch { /* continue */ }
  }

  return null;
}

async function resolveFixPriceForPart(input: {
  model: string | null | undefined;
  partNumber: string;
}) {
  const searchUrl = `https://www.fix.com/parts/search/?SearchTerm=${input.partNumber}`;
  try {
    const html = await fetchHtml(searchUrl);
    const snapshot = extractSnapshotFromPage({
      html,
      partNumber: input.partNumber,
      pricingUrl: searchUrl,
      targetKey: "fix"
    });
    
    if (snapshot) {
      return { ...snapshot, retailPriceSource: "fix.com" as const };
    }
  } catch (err) {
    console.warn(`[Retail Pricing] Fix.com search failed for ${input.partNumber}:`, err instanceof Error ? err.message : String(err));
  }

  // Fallback to grounding layer search
  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries: [`site:fix.com "${input.partNumber}"`],
      domain: "fix.com",
      maxResults: 3,
    })
  );

  for (const hit of hits) {
    if (!looksLikeFixUrl(hit.url)) continue;
    try {
      const html = await fetchHtml(hit.url);
      const snapshot = extractSnapshotFromPage({
        html,
        partNumber: input.partNumber,
        pricingUrl: hit.url,
        targetKey: "fix"
      });
      if (snapshot) {
        return { ...snapshot, retailPriceSource: "fix.com" as const };
      }
    } catch { /* continue */ }
  }

  return null;
}

async function resolvePoolPriceForPart(input: {
  brand?: string | null;
  model: string | null | undefined;
  partNumber: string;
}) {
  const brand = (input.brand || "").toLowerCase();
  const isWhirlpoolFamily = ["whirlpool", "maytag", "kitchenaid", "jennair", "amana"].some(b => brand.includes(b));
  
  if (!isWhirlpoolFamily) return null;

  const searchUrl = `https://www.whirlpoolparts.com/PartSearch/Search?searchTerm=${input.partNumber}`;
  try {
    const html = await fetchHtml(searchUrl);
    const snapshot = extractSnapshotFromPage({
      html,
      partNumber: input.partNumber,
      pricingUrl: searchUrl,
      targetKey: "pool"
    });
    
    if (snapshot) {
      return { ...snapshot, retailPriceSource: "whirlpoolparts.com" as any };
    }
  } catch (err) {
    console.warn(`[Retail Pricing] Pool search failed for ${input.partNumber}:`, err instanceof Error ? err.message : String(err));
  }

  return null;
}

async function resolvePriceWaterfall(input: {
  brand?: string | null;
  model: string | null | undefined;
  partNumber: string;
}) {
  // 1. Encompass
  const encompass = await resolveEncompassPriceForPart(input);
  if (encompass) return encompass;

  // 2. Sears
  const sears = await resolveSearsPriceForPart(input);
  if (sears) return sears;

  // 3. Pool (Whirlpool Parts)
  const pool = await resolvePoolPriceForPart(input);
  if (pool) return pool;

  // 4. Fix.com
  const fix = await resolveFixPriceForPart(input);
  if (fix) return fix;

  return null;
}

export async function enrichBomRowsWithRetailPricing(input: {
  brand?: string | null;
  model?: string | null;
  rows: BomRow[];
  maxTargetedLookups?: number;
}) {
  if (!input.rows.length) {
    return {
      rows: input.rows,
      pricedRowCount: 0,
      issues: [] as string[],
    };
  }

  const priceByPart = new Map<string, RetailPriceSnapshot>();
  const encompassPageTextCache = new Map<string, string>();

  const encompassSourceUrls = uniqueBy(
    input.rows
      .map((row) => row.sourceUrl)
      .filter((url) => looksLikeEncompassUrl(url)),
    (url) => url,
  );

  for (const url of encompassSourceUrls) {
    try {
      const html = await fetchHtml(url);
      encompassPageTextCache.set(url, html);
    } catch {
      // continue
    }
  }

  for (const row of input.rows) {
    const partNumber = getRowPartNumber(row);
    if (!partNumber || priceByPart.has(partNumber)) continue;
    if (!looksLikeEncompassUrl(row.sourceUrl)) continue;

    const html = encompassPageTextCache.get(row.sourceUrl);
    if (!html) continue;

    const snapshot = extractSnapshotFromPage({
      html,
      partNumber,
      pricingUrl: row.sourceUrl,
      targetKey: "encompass"
    });

    if (snapshot) {
      priceByPart.set(partNumber, snapshot);
    }
  }

  const unresolvedPartNumbers = uniqueBy(
    input.rows
      .map((row) => getRowPartNumber(row))
      .filter(Boolean) as string[],
    (partNumber) => partNumber,
  ).filter((partNumber) => !priceByPart.has(partNumber));

  const targetedPartNumbers = unresolvedPartNumbers.slice(
    0,
    input.maxTargetedLookups ?? 24,
  );

  const lookupConcurrency = Math.min(
    4,
    Number.parseInt(process.env.BOM_PRICING_LOOKUP_CONCURRENCY ?? "4", 10) || 4,
  );

  const targetedSnapshots = await runWithConcurrency(
    targetedPartNumbers,
    lookupConcurrency,
    async (partNumber) => ({
      partNumber,
      snapshot: await resolvePriceWaterfall({
        brand: input.brand,
        model: input.model,
        partNumber,
      }),
    }),
  );

  for (const result of targetedSnapshots) {
    if (result.snapshot) {
      priceByPart.set(result.partNumber, result.snapshot);
    }
  }

  const rows = input.rows.map((row) => {
    const partNumber = getRowPartNumber(row);
    if (!partNumber) return row;

    const snapshot = priceByPart.get(partNumber);
    if (!snapshot) return row;

    return {
      ...row,
      retailPrice: {
        status: snapshot.status,
        source: snapshot.retailPriceSource ?? undefined,
        listedPrice: snapshot.retailPrice,
        currency: "USD" as const,
        productUrl: snapshot.retailPricingUrl,
        checkedAt: snapshot.retailPricedAt,
        matchType: snapshot.matchType,
        requestedPartNumber: partNumber,
        matchedPartNumber: snapshot.matchedPartNumber,
      },
      retailPriceText: snapshot.retailPriceText,
      retailAvailability: snapshot.retailAvailability,
      retailPricingUrl: snapshot.retailPricingUrl,
      retailPriceSource: snapshot.retailPriceSource,
      retailPriceVerified: snapshot.retailPriceVerified,
      retailPricedAt: snapshot.retailPricedAt,
    };
  });

  const pricedRowCount = rows.filter(
    (row) => typeof row.retailPrice === "number",
  ).length;

  const issues: string[] = [];
  if (rows.length > 0 && pricedRowCount === 0) {
    issues.push("Retail pricing pass found 0 authorized retailer prices.");
  }

  return {
    rows,
    pricedRowCount,
    issues,
  };
}

export async function fetchRetailPricingBatch(input: {
  brand?: string | null;
  model?: string | null;
  partNumbers: string[];
}) {
  const results = await Promise.all(
    input.partNumbers.map(async (partNumber) => {
      try {
        const snapshot = await resolvePriceWaterfall({
          model: input.model,
          partNumber,
        });
        return { partNumber, snapshot };
      } catch {
        return { partNumber, snapshot: null };
      }
    })
  );

  return results.reduce((acc, curr) => {
    if (curr.snapshot) {
      acc[curr.partNumber] = curr.snapshot;
    }
    return acc;
  }, {} as Record<string, RetailPriceSnapshot>);
}
export async function verifyPartNumber(input: {
  model?: string | null;
  partNumber: string;
}) {
  try {
    const snapshot = await resolvePriceWaterfall({
      model: input.model,
      partNumber: input.partNumber,
    });
    return {
      isValid: !!snapshot,
      source: snapshot?.retailPriceSource || null,
      price: snapshot?.retailPrice || null,
    };
  } catch (error) {
    console.error("[Retail Pricing] Verification failed:", error);
    return { isValid: false, source: null, price: null };
  }
}

export function validate_exact_price_evidence(input: {
  requestedPartNumber: string;
  matchedPartNumber: string;
  html?: string;
  text?: string;
}) {
  const normRequested = input.requestedPartNumber.toUpperCase().replace(/\s+/g, "");
  const normMatched = input.matchedPartNumber.toUpperCase().replace(/\s+/g, "");
  
  if (normRequested !== normMatched) {
    return {
      valid: false,
      reason: `Part number mismatch: requested ${normRequested}, matched ${normMatched}`,
    };
  }
  
  if (input.text && !input.text.toUpperCase().includes(normRequested)) {
     return {
      valid: false,
      reason: `Part number ${normRequested} not found in evidence text`,
    };
  }
  
  return { valid: true };
}

export async function resolve_part_pricing_sources(input: {
  partNumber: string;
  brand?: string | null;
}) {
  const sources = [
    { name: "Encompass", domain: "encompass.com", priority: 1 },
    { name: "Sears PartsDirect", domain: "searspartsdirect.com", priority: 2 },
    { name: "Fix.com", domain: "fix.com", priority: 3 },
  ];
  
  return sources;
}
