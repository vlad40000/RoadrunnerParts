import "server-only";

import { db } from "@/server/db";
import { providerPartSeedRows } from "@/server/db/schema/provider-seeds";
import { partPriceSnapshots } from "@/server/db/schema/part-pricing";
import { sql } from "drizzle-orm";
import { runStructuredJson } from "./model-runner";
import {
  findCachedModelParts,
  normalizeModelKey,
  upsertModelPartsCache,
} from "./model-parts-cache";
import { fetchSourcesFromSpecificProviders } from "./source-fetcher";
import { parseStructuredSourceText } from "./bom-orchestrator";
import { enrichBomRowsWithRetailPricing } from "./retail-pricing";
import { cleanText, uniqueBy } from "./providers/utils";
import { saveBomArtifacts, updateBomJobSummary } from "./job-store";

export type BomPartWorkflowInput = {
  jobId?: string | null;
  modelNumber: string;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
  maxPricingLookups?: number | null;
  modelTimeoutMs?: number | null;
};

type CatalogPart = {
  id?: string | number | null;
  section?: string | null;
  description?: string | null;
  originalPartNumber?: string | null;
  currentServicePartNumber?: string | null;
  partNumber?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  sourceProvider?: string | null;
  retailPrice?: number | null;
  retailPriceText?: string | null;
  retailAvailability?: string | null;
  retailPricingUrl?: string | null;
  retailPriceSource?: string | null;
  retailPriceVerified?: boolean;
  retailPricedAt?: string | null;
};

type CatalogResult = {
  parts: CatalogPart[];
  expectedPartsTotal: number | null;
  expectedPartsSource: string | null;
  expectedPartsSourceUrl: string | null;
};

type ParallelModelReview = {
  lane: "flash_preview" | "lite_preview_a" | "lite_preview_b";
  model: "gemini-3-flash-preview" | "gemini-3.1-flash-lite-preview";
  status: "fulfilled" | "rejected";
  output?: unknown;
  error?: string;
};

function normalizePartNumber(value: unknown) {
  return cleanText(String(value || "")).toUpperCase().replace(/\s+/g, "");
}

function partNumberOf(part: CatalogPart) {
  return normalizePartNumber(
    part.currentServicePartNumber || part.partNumber || part.originalPartNumber,
  );
}

function getSettledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function cachedPartsToCatalog(cache: any): CatalogPart[] {
  if (!cache?.parts || !Array.isArray(cache.parts)) return [];
  return cache.parts.map((part: any) => ({
    ...part,
    partNumber: part.partNumber || part.part_number,
    description: part.description || part.part_name || part.name,
    section: part.section || part.mapped_encompass_assembly,
    sourceProvider: part.sourceProvider || part.source_provider || "model_parts_cache",
  }));
}

function countSections(parts: CatalogPart[]) {
  return new Set(parts.map((part) => cleanText(part.section || "")).filter(Boolean)).size;
}

async function getModelCache(modelNumber: string): Promise<CatalogResult & {
  cache: any;
  masterRowCount: number;
  sectionCount: number;
}> {
  const cache = await findCachedModelParts(modelNumber);
  const parts = cachedPartsToCatalog(cache);
  const expectedPartsTotal =
    Number(cache?.trustedTotalPartCount || cache?.expectedPartsTotal || 0) || null;

  return {
    cache,
    parts,
    masterRowCount: parts.length,
    sectionCount: countSections(parts),
    expectedPartsTotal,
    expectedPartsSource:
      cache?.trustedTotalCountSource || cache?.expectedPartsSource || null,
    expectedPartsSourceUrl:
      cache?.trustedTotalCountSourceUrl || cache?.truthSource || null,
  };
}

async function getCachedSupplierSeed(modelNumber: string): Promise<CatalogResult> {
  const normalizedModel = normalizeModelKey(modelNumber);
  if (!normalizedModel) {
    return {
      parts: [],
      expectedPartsTotal: null,
      expectedPartsSource: null,
      expectedPartsSourceUrl: null,
    };
  }

  const rows = await db
    .select()
    .from(providerPartSeedRows)
    .where(sql`upper(regexp_replace(${providerPartSeedRows.model}, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}`)
    .limit(1000);

  const parts = rows.map((row) => ({
    section: row.sectionNameClean || row.sectionLabelRaw || row.normalizedSection || "Uncategorized",
    description: row.description || "Appliance Part",
    originalPartNumber: row.originalPartNumber,
    currentServicePartNumber: row.currentServicePartNumber || row.originalPartNumber,
    partNumber: row.currentServicePartNumber || row.originalPartNumber,
    sourceUrl: row.diagramUrl || row.providerAssemblyUrl || row.providerModelUrl,
    sourceType: "provider_seed",
    sourceProvider: row.provider,
  }));

  return {
    parts,
    expectedPartsTotal: null,
    expectedPartsSource: rows[0]?.provider ? `${rows[0].provider}:seed_rows` : null,
    expectedPartsSourceUrl:
      rows[0]?.providerModelUrl || rows[0]?.providerAssemblyUrl || rows[0]?.diagramUrl || null,
  };
}

async function fetchSearsModelCatalog(input: BomPartWorkflowInput): Promise<CatalogResult> {
  const sources = await fetchSourcesFromSpecificProviders({
    brand: input.brand || null,
    model: input.modelNumber,
    productType: input.productType || null,
    providerNames: ["sears-partsdirect"],
  });

  let expectedPartsTotal: number | null = null;
  let expectedPartsSourceUrl: string | null = null;

  const parts = sources.flatMap((source) => {
    const metaExpected = Number(source.meta?.expectedPartsTotal || 0);
    if (!expectedPartsTotal && metaExpected > 0) {
      expectedPartsTotal = metaExpected;
      expectedPartsSourceUrl = source.sourceUrl;
    }

    return parseStructuredSourceText(source.text).map((part) => ({
      ...part,
      section: source.sectionName || "All Model Parts",
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType,
      sourceProvider: source.provider,
    }));
  });

  return {
    parts,
    expectedPartsTotal,
    expectedPartsSource: expectedPartsTotal
      ? "sears-partsdirect:CATALOG_API_RESPONSE"
      : null,
    expectedPartsSourceUrl,
  };
}

function mergeCatalogParts(results: CatalogResult[]) {
  return uniqueBy(
    results
      .flatMap((result) => result.parts)
      .filter((part) => partNumberOf(part))
      .map((part) => ({
        ...part,
        partNumber: partNumberOf(part),
        currentServicePartNumber: part.currentServicePartNumber || part.partNumber,
      })),
    (part) => partNumberOf(part),
  );
}

function selectExpectedTotal(results: CatalogResult[], actualCount: number) {
  const deterministic = results.find(
    (result) =>
      result.expectedPartsTotal &&
      result.expectedPartsTotal > 0 &&
      result.expectedPartsSource,
  );

  if (deterministic) {
    return {
      expectedPartsTotal: deterministic.expectedPartsTotal,
      expectedPartsSource: deterministic.expectedPartsSource,
      expectedPartsSourceUrl: deterministic.expectedPartsSourceUrl,
    };
  }

  return {
    expectedPartsTotal: actualCount || null,
    expectedPartsSource: actualCount ? "compiled_catalog_unique_part_count" : null,
    expectedPartsSourceUrl: null,
  };
}

async function runParallelBomModelCalls(input: {
  modelNumber: string;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
  expectedPartsTotal: number | null;
  expectedPartsSource: string | null;
  catalogParts: CatalogPart[];
  timeoutMs?: number | null;
}): Promise<ParallelModelReview[]> {
  const sourceBackedRows = input.catalogParts.slice(0, 220).map((part) => ({
    partNumber: partNumberOf(part),
    description: part.description || null,
    section: part.section || null,
    sourceProvider: part.sourceProvider || null,
    sourceUrl: part.sourceUrl || null,
    hasVerifiedPrice: part.retailPriceVerified === true,
  }));

  const prompt = [
    "Return JSON only.",
    "You are reviewing a source-backed appliance BOM compile payload.",
    "Do not invent parts, prices, or expected counts.",
    "Use the deterministic expected count only when it is provided in the input.",
    "Identify duplicate risk, missing price targets, and coverage blockers from the supplied rows.",
    "The final BOM truth remains the source-backed row list, not this model review.",
    "",
    "Return this shape:",
    JSON.stringify({
      coverageAssessment: "complete|partial|weak|unknown",
      expectedPartsTotalAccepted: null,
      duplicatePartNumbers: ["string"],
      unpricedPartNumbers: ["string"],
      coverageBlockers: ["string"],
      notes: ["string"],
    }, null, 2),
  ].join("\n");

  const text = JSON.stringify({
    modelNumber: input.modelNumber,
    brand: input.brand || null,
    serial: input.serial || null,
    productType: input.productType || null,
    expectedPartsTotal: input.expectedPartsTotal,
    expectedPartsSource: input.expectedPartsSource,
    actualPartCount: input.catalogParts.length,
    sourceBackedRows,
  });

  const calls = [
    {
      lane: "flash_preview" as const,
      model: "gemini-3-flash-preview" as const,
    },
    {
      lane: "lite_preview_a" as const,
      model: "gemini-3.1-flash-lite-preview" as const,
    },
    {
      lane: "lite_preview_b" as const,
      model: "gemini-3.1-flash-lite-preview" as const,
    },
  ];

  const timeoutMs =
    input.timeoutMs && input.timeoutMs > 0
      ? input.timeoutMs
      : Number(process.env.BOM_PARALLEL_MODEL_TIMEOUT_MS || 45_000);

  function withModelTimeout<T>(promise: Promise<T>, call: typeof calls[number]) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `${call.model} ${call.lane} timed out after ${timeoutMs}ms; source-backed rows were already written to the sheet.`,
          ),
        );
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  const settled = await Promise.allSettled(
    calls.map((call) =>
      withModelTimeout(
        runStructuredJson({
          model: call.model,
          responseMimeType: "application/json",
          temperature: 1.0,
          prompt,
          text,
          maxOutputTokens: 4096,
        }),
        call,
      ),
    ),
  );

  return settled.map((result, index) => {
    const call = calls[index];
    if (result.status === "fulfilled") {
      return {
        lane: call.lane,
        model: call.model,
        status: "fulfilled",
        output: result.value,
      };
    }

    return {
      lane: call.lane,
      model: call.model,
      status: "rejected",
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

async function verifyPricesForFullCatalog(input: {
  modelNumber: string;
  brand?: string | null;
  catalogParts: CatalogPart[];
  maxPricingLookups?: number | null;
}) {
  const rows = input.catalogParts.map((part) => ({
    ...part,
    part_number: partNumberOf(part),
    description: part.description || null,
    callout_number: part.id ? String(part.id) : null,
    quantity: 1,
    price_cents: null,
    currency: "USD" as const,
    availability_status: null,
    mapped_encompass_assembly: part.section || null,
    mapping_status: "mapped" as const,
    confidence: 0.95,
    evidence_text: part.sourceUrl || null,
    originalPartNumber: part.originalPartNumber || partNumberOf(part),
    currentServicePartNumber: part.currentServicePartNumber || partNumberOf(part),
    section: part.section || "Uncategorized",
    sourceUrl: part.sourceUrl || "",
    sourceType: part.sourceType || "catalog",
  }));

  const maxTargetedLookups =
    input.maxPricingLookups && input.maxPricingLookups > 0
      ? Math.min(input.maxPricingLookups, rows.length)
      : rows.length;

  const priced = await enrichBomRowsWithRetailPricing({
    brand: input.brand || null,
    model: input.modelNumber,
    rows: rows as any,
    maxTargetedLookups,
  });

  return priced.rows as CatalogPart[];
}

async function persistVerifiedPrices(modelNumber: string, pricedParts: CatalogPart[]) {
  const normalizedModel = normalizeModelKey(modelNumber);
  const verifiedRows = pricedParts.filter(
    (row) => row.retailPriceVerified === true && typeof row.retailPrice === "number",
  );

  for (const row of verifiedRows) {
    await db.insert(partPriceSnapshots).values({
      partNumber: partNumberOf(row),
      normalizedModel,
      primarySource: row.retailPriceSource || null,
      listedPrice: String(row.retailPrice),
      currency: "USD",
      availability: row.retailAvailability || null,
      productUrl: row.retailPricingUrl || null,
      matchType: "exact_part_number",
      priceStatus: "verified_price",
      checkedAt: new Date(),
      raw: row,
    }).catch(() => undefined);
  }
}

function countPricedRows(rows: CatalogPart[]) {
  return rows.filter(
    (row) =>
      row.retailPriceVerified === true &&
      row.retailPrice !== null &&
      row.retailPrice !== undefined,
  ).length;
}

function buildCustomerResults(input: {
  pricedParts: CatalogPart[];
  expectedPartsTotal: number | null;
  expectedPartsSource: string | null;
  expectedPartsSourceUrl: string | null;
}) {
  const verifiedPriceCount = countPricedRows(input.pricedParts);
  const actualPartCount = input.pricedParts.length;
  const partsComplete =
    !!input.expectedPartsTotal && actualPartCount >= input.expectedPartsTotal;
  const pricingComplete = partsComplete && verifiedPriceCount >= actualPartCount;

  return {
    expectedPartsTotal: input.expectedPartsTotal,
    expectedPartsSource: input.expectedPartsSource,
    expectedPartsSourceUrl: input.expectedPartsSourceUrl,
    actualPartCount,
    verifiedPriceCount,
    unpricedCount: Math.max(0, actualPartCount - verifiedPriceCount),
    partsComplete,
    pricingComplete,
    retrievalState: partsComplete
      ? pricingComplete
        ? "bom_complete"
        : verifiedPriceCount > 0
          ? "parts_complete_pricing_partial"
          : "parts_complete_pricing_missing"
      : "parts_partial",
    parts: input.pricedParts.map((part) => ({
      ...part,
      partNumber: partNumberOf(part),
      currentServicePartNumber: part.currentServicePartNumber || partNumberOf(part),
      price: part.retailPrice ?? null,
      priceSource: part.retailPriceSource ?? null,
      priceVerified: part.retailPriceVerified === true,
    })),
  };
}

async function writeRowsToSheet(input: {
  jobId?: string | null;
  modelNumber: string;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
  result: ReturnType<typeof buildCustomerResults>;
}) {
  if (!input.jobId) return;

  await saveBomArtifacts(input.jobId, {
    finalRows: input.result.parts as any,
  });

  await updateBomJobSummary(input.jobId, {
    brand: input.brand ?? undefined,
    model: input.modelNumber,
    serial: input.serial ?? undefined,
    productType: input.productType ?? undefined,
    jobStage: "part_workflow_rows_written",
    retrievalState: input.result.retrievalState as any,
    expectedPartsTotal: input.result.expectedPartsTotal,
    expectedPartsSource: input.result.expectedPartsSource,
    expectedPartCount: input.result.expectedPartsTotal,
    trustedTotalPartCount: input.result.expectedPartsTotal,
    trustedTotalCountSource: input.result.expectedPartsSource,
    trustedTotalCountSourceUrl: input.result.expectedPartsSourceUrl,
    trustedTotalCountCheckedAt: input.result.expectedPartsTotal ? new Date() : null,
    actualPartCount: input.result.actualPartCount,
    actualCanonicalPartCount: input.result.actualPartCount,
    actualUniqueParts: input.result.actualPartCount,
    rawRowCount: input.result.actualPartCount,
    uniqueRowCount: input.result.actualPartCount,
    verifiedPriceCount: input.result.verifiedPriceCount,
    requiredPriceCount: input.result.actualPartCount,
    unpricedCount: input.result.unpricedCount,
    coveragePct:
      input.result.expectedPartsTotal && input.result.expectedPartsTotal > 0
        ? Math.min(1, input.result.actualPartCount / input.result.expectedPartsTotal)
        : null,
    partsComplete: input.result.partsComplete,
    pricingComplete: input.result.pricingComplete,
    bomComplete: input.result.partsComplete && input.result.pricingComplete,
    sourceStrategy: "complete_catalog_with_full_pricing:part_workflow",
  });
}

export async function runBomPartWorkflow(input: BomPartWorkflowInput) {
  const cache = await getModelCache(input.modelNumber);
  const cacheValid = cache.masterRowCount >= 20 && cache.sectionCount > 0;

  const [searsResult, seedResult] = await Promise.allSettled([
    cacheValid
      ? Promise.resolve({
          parts: cache.parts,
          expectedPartsTotal: cache.expectedPartsTotal,
          expectedPartsSource: cache.expectedPartsSource,
          expectedPartsSourceUrl: cache.expectedPartsSourceUrl,
        } satisfies CatalogResult)
      : fetchSearsModelCatalog(input),
    getCachedSupplierSeed(input.modelNumber),
  ]);

  const catalogResults = [
    getSettledValue(searsResult, {
      parts: [],
      expectedPartsTotal: null,
      expectedPartsSource: null,
      expectedPartsSourceUrl: null,
    }),
    getSettledValue(seedResult, {
      parts: [],
      expectedPartsTotal: null,
      expectedPartsSource: null,
      expectedPartsSourceUrl: null,
    }),
  ];

  const catalogParts = mergeCatalogParts(catalogResults);
  const expected = selectExpectedTotal(catalogResults, catalogParts.length);

  const pricedParts = await verifyPricesForFullCatalog({
    modelNumber: input.modelNumber,
    brand: input.brand,
    catalogParts,
    maxPricingLookups: input.maxPricingLookups,
  });

  const result = buildCustomerResults({
    pricedParts,
    ...expected,
  });

  await writeRowsToSheet({
    jobId: input.jobId,
    modelNumber: input.modelNumber,
    brand: input.brand,
    serial: input.serial,
    productType: input.productType,
    result,
  });

  const modelReviews = await runParallelBomModelCalls({
    modelNumber: input.modelNumber,
    brand: input.brand,
    serial: input.serial,
    productType: input.productType,
    catalogParts: pricedParts,
    expectedPartsTotal: expected.expectedPartsTotal,
    expectedPartsSource: expected.expectedPartsSource,
    timeoutMs: input.modelTimeoutMs,
  });

  await upsertModelPartsCache({
    model: input.modelNumber,
    parts: result.parts,
    brand: input.brand || undefined,
    retrievalState: result.retrievalState,
    expectedPartsTotal: result.expectedPartsTotal || undefined,
    expectedPartsSource: result.expectedPartsSource || undefined,
    trustedTotalPartCount: result.expectedPartsTotal || undefined,
    trustedTotalCountSource: result.expectedPartsSource || undefined,
    trustedTotalCountSourceUrl: result.expectedPartsSourceUrl || undefined,
    trustedTotalCountCheckedAt: result.expectedPartsTotal ? new Date() : undefined,
    actualCanonicalPartCount: result.actualPartCount,
    actualUniqueParts: result.actualPartCount,
    coveragePct:
      result.expectedPartsTotal && result.expectedPartsTotal > 0
        ? Math.min(1, result.actualPartCount / result.expectedPartsTotal)
        : null,
    partsComplete: result.partsComplete,
    isExhaustive: result.partsComplete,
    sourceStrategy: "complete_catalog_with_full_pricing",
    truthSource: result.expectedPartsSourceUrl || undefined,
  });

  await persistVerifiedPrices(input.modelNumber, pricedParts);

  return {
    ok: true,
    modelNumber: input.modelNumber,
    serial: input.serial || null,
    fromCache: cacheValid,
    modelReviews,
    ...result,
  };
}
