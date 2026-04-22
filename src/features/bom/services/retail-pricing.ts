import "server-only";

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
  retailPrice: number;
  retailPriceText: string;
  retailAvailability: string | null;
  retailPricingUrl: string;
  retailPriceSource: "encompass.com";
  retailPriceVerified: true;
  retailPricedAt: string;
};

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
        retailPrice: price.value,
        retailPriceText: price.text,
        retailAvailability: parseAvailability(windowText),
        retailPricingUrl: input.pricingUrl,
        retailPriceSource: "encompass.com" as const,
        retailPriceVerified: true as const,
        retailPricedAt: new Date().toISOString(),
      };
    }

    index = haystack.indexOf(token, index + token.length);
    attempts += 1;
  }

  return null;
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
      maxResults: 6,
    }),
  );

  for (const hit of hits) {
    if (!looksLikeEncompassUrl(hit.url)) continue;

    try {
      const html = await fetchHtml(hit.url);
      const text = htmlToText(html);

      if (!text.toUpperCase().includes(input.partNumber.toUpperCase())) {
        continue;
      }

      const snapshot = extractSnapshotFromPageText({
        pageText: text,
        partNumber: input.partNumber,
        pricingUrl: hit.url,
      });

      if (snapshot) {
        return snapshot;
      }
    } catch {
      // continue
    }
  }

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
      const text = htmlToText(html);
      encompassPageTextCache.set(url, text);
    } catch {
      // continue
    }
  }

  for (const row of input.rows) {
    const partNumber = getRowPartNumber(row);
    if (!partNumber || priceByPart.has(partNumber)) continue;
    if (!looksLikeEncompassUrl(row.sourceUrl)) continue;

    const pageText = encompassPageTextCache.get(row.sourceUrl);
    if (!pageText) continue;

    const snapshot = extractSnapshotFromPageText({
      pageText,
      partNumber,
      pricingUrl: row.sourceUrl,
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
      snapshot: await resolveEncompassPriceForPart({
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
      retailPrice: snapshot.retailPrice,
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
    issues.push("Retail pricing pass found 0 Encompass prices.");
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
        const snapshot = await resolveEncompassPriceForPart({
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
