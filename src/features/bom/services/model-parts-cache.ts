import { db } from '../../../server/db';
import { modelPartsCache } from '../../../server/db/schema/model-parts-cache';
import { providerPartSeedRows } from '../../../server/db/schema/provider-seeds';
import { eq, sql } from 'drizzle-orm';

/**
 * Normalizes a model number for consistent cache lookup.
 * Removes non-alphanumeric characters and converts to uppercase.
 */
export function normalizeModelKey(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toSeedPart(row: typeof providerPartSeedRows.$inferSelect) {
  return {
    section: row.sectionNameClean || row.sectionLabelRaw || row.normalizedSection || 'Uncategorized',
    diagramNumber: row.diagramNumber || '',
    originalPartNumber: row.originalPartNumber || null,
    currentServicePartNumber: row.currentServicePartNumber || row.originalPartNumber || null,
    partNumber: row.currentServicePartNumber || row.originalPartNumber || null,
    description: row.description || 'Appliance Part',
    nlaStatus: Boolean(row.nlaStatus),
    replacementNote: row.replacementNote || null,
    sourceUrl: row.diagramUrl || row.providerAssemblyUrl || row.providerModelUrl || '',
    sourceType: 'provider_seed',
    sourceProvider: row.provider,
    sourceStatus: row.sourceStatus,
    sourceFile: row.sourceFile,
    retailPrice: null,
    retailPriceText: null,
    retailAvailability: null,
    retailPriceSource: null,
    retailPriceVerified: false,
    confidence: 0.95,
  };
}

async function findProviderSeedModelParts(model: string) {
  const normalizedModel = normalizeModelKey(model);
  if (!normalizedModel) return null;

  const rows = await db
    .select()
    .from(providerPartSeedRows)
    .where(sql`upper(regexp_replace(${providerPartSeedRows.model}, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}`)
    .limit(500);

  if (!rows.length) return null;

  console.log(`[ModelPartsCache] SEED HIT: Found ${rows.length} provider seed rows for ${normalizedModel}`);
  const first = rows[0];

  return {
    id: `provider-seed:${normalizedModel}`,
    normalizedModel,
    brand: first.brand,
    category: first.applianceType,
    applianceType: first.applianceType,
    fuelType: first.fuelType,
    parts: rows.map(toSeedPart),
    isExhaustive: 'false',
    msrp: null,
    retrievalState: 'parts_seeded_pricing_needed',
    expectedPartsTotal: null,
    expectedPartsSource: first.provider,
    trustedTotalPartCount: null,
    trustedTotalCountSource: first.provider,
    trustedTotalCountSourceUrl: first.providerModelUrl,
    trustedTotalCountCheckedAt: null,
    actualCanonicalPartCount: rows.length,
    partsComplete: false,
    actualUniqueParts: rows.length,
    coveragePct: null,
    truthSource: first.providerModelUrl || first.providerAssemblyUrl || first.diagramUrl,
    sourceStrategy: 'provider-seed-db',
    fallbackSources: [],
    sourceSummary: [
      {
        source: first.provider,
        sourceStatus: first.sourceStatus,
        sourceFile: first.sourceFile,
        rowCount: rows.length,
      },
    ],
    rejectedParts: [],
    validationVersion: CURRENT_VALIDATION_VERSION,
    lastVerifiedAt: null,
    updatedAt: first.createdAt,
    createdAt: first.createdAt,
    isProviderSeed: true,
  };
}

export async function findCachedModelParts(model: string) {
  const normalizedModel = normalizeModelKey(model);
  if (!normalizedModel) return null;

  console.log(`[ModelPartsCache] Searching for normalized model: ${normalizedModel}`);
  
  try {
    const results = await db
      .select()
      .from(modelPartsCache)
      .where(eq(modelPartsCache.normalizedModel, normalizedModel))
      .limit(1);

    if (results.length > 0) {
      console.log(`[ModelPartsCache] HIT: Found cached parts for ${normalizedModel}`);
      return results[0];
    }

    console.log(`[ModelPartsCache] MISS: No cached parts for ${normalizedModel}`);
    return await findProviderSeedModelParts(model);
  } catch (error) {
    console.error(`[ModelPartsCache] Error reading cache for ${normalizedModel}:`, error);
    try {
      return await findProviderSeedModelParts(model);
    } catch (seedError) {
      console.error(`[ModelPartsCache] Error reading provider seed rows for ${normalizedModel}:`, seedError);
      return null;
    }
  }
}

export const CURRENT_VALIDATION_VERSION = "2.0";

export async function findCompleteCachedBom(model: string) {
  const normalizedModel = normalizeModelKey(model);
  if (!normalizedModel) return null;

  try {
    const results = await db
      .select()
      .from(modelPartsCache)
      .where(eq(modelPartsCache.normalizedModel, normalizedModel))
      .limit(1);

    if (results.length > 0) {
      const cache = results[0];
      const coverage = cache.coveragePct ?? 0;
      const version = cache.validationVersion ?? "1.0";

      // v2.0 Logic: Strict coverage or complete state
      if (version === CURRENT_VALIDATION_VERSION) {
        if (cache.retrievalState === 'bom_complete' || (coverage >= 0.95 && cache.retrievalState === 'parts_complete_pricing_partial')) {
          return cache;
        }
      } 
      // v1.0 Logic (Legacy): Soft-allow if it was marked complete or near-complete
      else if (cache.retrievalState === 'bom_complete' || cache.retrievalState === 'parts_complete_pricing_partial') {
        console.log(`[ModelPartsCache] Soft-HIT: Returning legacy v1 cache for ${normalizedModel}`);
        return {
          ...cache,
          isLegacy: true,
          validationVersion: version
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`[ModelPartsCache] Error reading complete cache for ${normalizedModel}:`, error);
    return null;
  }
}

export async function upsertModelPartsCache(data: {
  model: string;
  parts: any[];
  isExhaustive?: boolean;
  brand?: string;
  category?: string;
  msrp?: number;
  retrievalState?: string;
  expectedPartsTotal?: number;
  expectedPartsSource?: string;
  trustedTotalPartCount?: number;
  trustedTotalCountSource?: string;
  trustedTotalCountSourceUrl?: string;
  trustedTotalCountCheckedAt?: string | Date;
  actualCanonicalPartCount?: number;
  partsComplete?: boolean;
  actualUniqueParts?: number;
  coveragePct?: number;
  truthSource?: string;
  sourceStrategy?: string;
  fallbackSources?: any[];
  sourceSummary?: any[];
  rejectedParts?: any[];
  validationVersion?: string;
  applianceType?: string;
  fuelType?: string;
}) {
  const normalizedModel = normalizeModelKey(data.model);
  if (!normalizedModel) return;

  console.log(`[ModelPartsCache] Upserting cache for ${normalizedModel} (${data.parts.length} parts)`);

  try {
    const values = {
      parts: data.parts,
      isExhaustive: data.isExhaustive ? 'true' : 'false',
      brand: data.brand || null,
      category: data.category || null,
      msrp: data.msrp?.toString() || null,
      retrievalState: data.retrievalState || 'unknown',
      expectedPartsTotal: data.expectedPartsTotal || null,
      expectedPartsSource: data.expectedPartsSource || null,
      trustedTotalPartCount: data.trustedTotalPartCount || data.expectedPartsTotal || null,
      trustedTotalCountSource: data.trustedTotalCountSource || data.expectedPartsSource || null,
      trustedTotalCountSourceUrl: data.trustedTotalCountSourceUrl || data.truthSource || null,
      trustedTotalCountCheckedAt: data.trustedTotalCountCheckedAt
        ? new Date(data.trustedTotalCountCheckedAt)
        : null,
      actualCanonicalPartCount: data.actualCanonicalPartCount || data.actualUniqueParts || data.parts.length,
      partsComplete: data.partsComplete ?? Boolean(
        (data.trustedTotalPartCount || data.expectedPartsTotal) &&
        (data.actualCanonicalPartCount || data.actualUniqueParts || data.parts.length) >=
          (data.trustedTotalPartCount || data.expectedPartsTotal || 0),
      ),
      actualUniqueParts: data.actualUniqueParts || null,
      coveragePct: data.coveragePct || null,
      truthSource: data.truthSource || null,
      sourceStrategy: data.sourceStrategy || null,
      fallbackSources: data.fallbackSources || [],
      sourceSummary: data.sourceSummary || [],
      rejectedParts: data.rejectedParts || [],
      validationVersion: data.validationVersion || CURRENT_VALIDATION_VERSION,
      applianceType: data.applianceType || null,
      fuelType: data.fuelType || null,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if exists
    const existing = await db
      .select({ id: modelPartsCache.id })
      .from(modelPartsCache)
      .where(eq(modelPartsCache.normalizedModel, normalizedModel))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(modelPartsCache)
        .set(values)
        .where(eq(modelPartsCache.normalizedModel, normalizedModel));
    } else {
      await db.insert(modelPartsCache).values({
        id: normalizedModel,
        normalizedModel,
        ...values
      });
    }
  } catch (error) {
    console.error(`[ModelPartsCache] Error upserting cache for ${normalizedModel}:`, error);
  }
}
