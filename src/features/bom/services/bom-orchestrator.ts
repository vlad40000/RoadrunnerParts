import "server-only";
import { fetchAuthoritativeSources } from "./source-fetcher";
import { enrichBomRowsWithRetailPricing } from "./retail-pricing";
import { normalizeGeneratedParts } from "./utils";
import { upsertModelPartsCache } from "./model-parts-cache";

export type BomOrchestratorResult = {
  parts: any[];
  modelMSRP?: number;
  fromCache?: boolean;
  isExhaustive?: boolean;
  sourceType: "deterministic" | "ai";
};

/**
 * Orchestrates the Bill of Materials (BOM) retrieval process.
 * Follows a deterministic-first approach:
 * 1. Scraper-based extraction (Source Fetcher)
 * 2. Pricing Waterfall (Retail Pricing)
 * 3. AI Fallback (only if deterministic path fails)
 */
export async function orchestrateBomRetrieval(input: {
  brand: string | null;
  model: string;
  serial?: string | null;
  expectedPartCount?: number | null;
}): Promise<BomOrchestratorResult> {
  const { model, brand } = input;

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
        // SUCCESS: Deterministic path worked!
        // Mark as exhaustive if we have matched or exceeded the authoritative count
        const isExhaustive = input.expectedPartCount ? normalized.length >= input.expectedPartCount : normalized.length > 25;
        
        if (isExhaustive) {
          console.log(`[BOM Orchestrator] Exhaustive match achieved (${normalized.length}/${input.expectedPartCount || '?'}). Ending extraction.`);
        }
        
        return {
          parts: normalized,
          sourceType: "deterministic",
          isExhaustive,
        };
      }
    }
  }

  // STAGE 2: AI Fallback (Current logic from route.ts, but isolated)
  console.log(`[BOM Orchestrator] Deterministic path failed for ${model}. Signaling AI fallback...`);
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
