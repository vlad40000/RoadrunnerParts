import "server-only";
import { fetchAuthoritativeSources } from "./source-fetcher";
import { enrichBomRowsWithRetailPricing } from "./retail-pricing";
import { normalizeGeneratedParts } from "../../../../app/api/bom/route";
import { findCompleteCachedBom, upsertModelPartsCache, CURRENT_VALIDATION_VERSION } from "./model-parts-cache";
import { db } from "../../../server/db";
import { providerPartSeedRows } from "../../../server/db/schema/provider-seeds";
import { normalizeModel } from "./providers/utils";
import { generateAiBom } from "./bom-ai-service";

export type BomOrchestratorResult = {
  parts: any[];
  modelMSRP?: number;
  fromCache?: boolean;
  isExhaustive?: boolean;
  sourceType: "deterministic" | "ai" | "cache";
};

/**
 * Orchestrates the Bill of Materials (BOM) retrieval process.
 * Follows a deterministic-first approach:
 * 0. Cache Check (Neon Model Parts Cache)
 * 1. Scraper-based extraction (Source Fetcher)
 * 2. Pricing Waterfall (Retail Pricing)
 * 3. AI Fallback (Centralized AI Service with mandatory logging)
 */
export async function orchestrateBomRetrieval(input: {
  brand: string | null;
  model: string;
  serial?: string | null;
  expectedPartCount?: number | null;
}): Promise<BomOrchestratorResult> {
  const { model, brand } = input;

  // STAGE 0: Cache Check
  console.log(`[BOM Orchestrator] Checking cache for ${model}...`);
  const cached = await findCompleteCachedBom(model);
  if (cached) {
    console.log(`[BOM Orchestrator] Cache HIT for ${model}. Returning ${cached.parts?.length} parts.`);
    return {
      parts: cached.parts as any[],
      sourceType: "cache",
      fromCache: true,
      isExhaustive: cached.isExhaustive === 'true',
    };
  }

  // STAGE 1: Deterministic Scraper-based Extraction
  console.log(`[BOM Orchestrator] Starting deterministic extraction for ${model}...`);
  const sources = await fetchAuthoritativeSources({
    brand,
    model,
  });

  let allParts: any[] = [];

  if (sources.length > 0) {
    console.log(`[BOM Orchestrator] Found ${sources.length} authoritative sources for ${model}. Parsing...`);
    
    for (const source of sources) {
      const parsed = parseStructuredSourceText(source.text);
      
      // DB-FIRST: Save raw rows to the seed table
      if (parsed.length > 0) {
        console.log(`[BOM Orchestrator] Logging ${parsed.length} raw rows from ${source.provider} to DB...`);
        await db.insert(providerPartSeedRows).values(
          parsed.map(p => ({
            model: normalizeModel(model) || model,
            provider: source.provider,
            diagramNumber: p.id,
            description: p.description,
            originalPartNumber: p.partNumber,
            currentServicePartNumber: p.partNumber,
            sourceStatus: 'ingested'
          }))
        ).onConflictDoNothing();
      }

      allParts.push(...parsed);
    }
    
    if (allParts.length > 0) {
      console.log(`[BOM Orchestrator] Parsed ${allParts.length} parts from deterministic sources. Enriching with pricing...`);
      
      const { rows: pricedRows } = await enrichBomRowsWithRetailPricing({
        brand,
        model,
        rows: allParts as any,
      });
      
      const normalized = normalizeGeneratedParts(pricedRows);
      
      if (normalized.length > 0) {
        const isExhaustive = input.expectedPartCount ? normalized.length >= input.expectedPartCount : normalized.length > 15;
        
        console.log(`[BOM Orchestrator] PERSISTING ${normalized.length} parts to cache for ${model}...`);
        await upsertModelPartsCache({
          model,
          parts: normalized,
          isExhaustive,
          brand: brand || undefined,
          retrievalState: isExhaustive ? 'bom_complete' : 'parts_complete_pricing_partial',
          validationVersion: CURRENT_VALIDATION_VERSION,
          truthSource: sources[0]?.sourceUrl || 'deterministic_scraper'
        });

        return {
          parts: normalized,
          sourceType: "deterministic",
          isExhaustive,
        };
      }
    }
  }

  // STAGE 2: AI Fallback
  console.log(`[BOM Orchestrator] Deterministic path failed for ${model}. Calling AI fallback...`);
  
  const aiResult = await generateAiBom({
    model,
    brand,
    serial: input.serial,
    expectedPartCount: input.expectedPartCount,
    isExhaustive: false 
  });

  if (aiResult.parts && aiResult.parts.length > 0) {
    const normalized = normalizeGeneratedParts(aiResult.parts);
    
    console.log(`[BOM Orchestrator] AI successfully recovered ${normalized.length} parts for ${model}. PERSISTING to cache...`);
    
    await upsertModelPartsCache({
      model,
      parts: normalized,
      msrp: aiResult.modelMSRP,
      isExhaustive: false,
      brand: brand || undefined,
      retrievalState: 'parts_complete_pricing_partial',
      validationVersion: CURRENT_VALIDATION_VERSION,
      truthSource: 'ai_fallback_gemini'
    });

    return {
      parts: normalized,
      modelMSRP: aiResult.modelMSRP,
      sourceType: "ai",
      isExhaustive: false,
    };
  }

  return {
    parts: [],
    sourceType: "ai",
  };
}

export function parseStructuredSourceText(text: string): any[] {
  const parts: any[] = [];
  const lines = text.split("\n");
  
  for (const line of lines) {
    if (line.startsWith("ROW|")) {
      const fields = line.split("|").slice(1);
      const part: any = {};
      for (const field of fields) {
        const [key, value] = field.split("=");
        if (key === "diagram_number") part.id = value;
        if (key === "description") part.description = value;
        if (key === "original_part_number") part.partNumber = value;
        if (key === "current_service_part_number" && value) part.partNumber = value;
      }
      if (part.partNumber) {
        parts.push(part);
      }
    }
  }
  
  return parts;
}
