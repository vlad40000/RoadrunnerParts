import { db } from '../../../server/db';
import { modelPartsCache } from '../../../server/db/schema/model-parts-cache';
import { eq } from 'drizzle-orm';

/**
 * Normalizes a model number for consistent cache lookup.
 * Removes non-alphanumeric characters and converts to uppercase.
 */
export function normalizeModelKey(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    return null;
  } catch (error) {
    console.error(`[ModelPartsCache] Error reading cache for ${normalizedModel}:`, error);
    return null;
  }
}

export async function upsertModelPartsCache(data: {
  model: string;
  parts: any[];
  brand?: string;
  category?: string;
  msrp?: number;
}) {
  const normalizedModel = normalizeModelKey(data.model);
  if (!normalizedModel) return;

  console.log(`[ModelPartsCache] Upserting cache for ${normalizedModel} (${data.parts.length} parts)`);

  try {
    // Check if exists
    const existing = await db
      .select({ id: modelPartsCache.id })
      .from(modelPartsCache)
      .where(eq(modelPartsCache.normalizedModel, normalizedModel))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(modelPartsCache)
        .set({
          parts: data.parts,
          brand: data.brand || null,
          category: data.category || null,
          msrp: data.msrp?.toString() || null,
          updatedAt: new Date(),
        })
        .where(eq(modelPartsCache.normalizedModel, normalizedModel));
    } else {
      await db.insert(modelPartsCache).values({
        id: normalizedModel, // Using normalized model as the primary key ID for simplicity
        normalizedModel,
        parts: data.parts,
        brand: data.brand || null,
        category: data.category || null,
        msrp: data.msrp?.toString() || null,
      });
    }
  } catch (error) {
    console.error(`[ModelPartsCache] Error upserting cache for ${normalizedModel}:`, error);
  }
}
