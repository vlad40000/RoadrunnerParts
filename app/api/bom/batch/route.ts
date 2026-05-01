import { NextResponse } from 'next/server';
import { findCompleteCachedBom, normalizeModelKey } from '@/features/bom/services/model-parts-cache';
import { orchestrateBomRetrieval } from '@/features/bom/services/bom-orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 300; // Batch can take longer

export async function POST(req: Request) {
  try {
    const { models, brand, productType, forceRefresh = false } = await req.json();

    if (!Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid models array' }, { status: 400 });
    }

    const results = await Promise.all(models.map(async (model) => {
      const norm = normalizeModelKey(model);
      
      // 1. Cache Check
      if (!forceRefresh) {
        const cached = await findCompleteCachedBom(model);
        if (cached) {
          return {
            model,
            normalizedModel: norm,
            status: 'success',
            source: 'cache',
            retrievalState: cached.retrievalState,
            partsCount: cached.parts?.length || 0,
            parts: cached.parts
          };
        }
      }

      // 2. Retrieval
      try {
        const retrieval = await orchestrateBomRetrieval({
          model,
          brand: brand || null,
        });

        return {
          model,
          normalizedModel: norm,
          status: retrieval.parts.length > 0 ? 'success' : 'partial',
          source: retrieval.sourceType,
          partsCount: retrieval.parts.length,
          parts: retrieval.parts
        };
      } catch (err) {
        return {
          model,
          normalizedModel: norm,
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }));

    return NextResponse.json({
      batchId: crypto.randomUUID(),
      results
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal batch error' }, { status: 500 });
  }
}

