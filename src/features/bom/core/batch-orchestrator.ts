import { normalizeModelKey, findCachedModelParts, upsertModelPartsCache } from "../services/model-parts-cache";
import { validateLiveParts } from "./bom-validator";
import { normalizeBomRows } from "./bom-normalizer";
import { runStructuredJson } from "../services/model-runner";
import { buildFixModelUrl } from "../services/providers/fix-com";
import { COUNT_AND_DIAGRAM_LOCATOR, DIAGRAM_PARTS_EXTRACT, PRICE_PROMPT_RETAIL_ENRICHMENT } from "../prompts/engine";
import type { BomRow, BomStatus } from "../schemas/bom";
import { decodeSerialNumber } from "../../identity/decoder";
import { filterPartsBySerialApplicability } from "../../identity/applicability";

export type BomBatchRequest = {
  models: string[];
  serial?: string;
  retrievalMode: "parts_only" | "parts_with_prices";
  maxLivePassesPerModel?: number;
};

export async function runBatchBomRetrieval(input: BomBatchRequest) {
  const models = [...new Set(input.models.map(normalizeModelKey))].filter(Boolean);
  const results = [];

  for (const model of models) {
    // 1. DB Check
    const cached = await findCachedModelParts(model);
    const isComplete = (
      (cached?.retrievalState === 'bom_complete' || cached?.retrievalState === 'db_complete') &&
      cached?.parts && cached.parts.length > 0
    );

    if (isComplete && input.retrievalMode === 'parts_only') {
      results.push({ model, normalizedModel: model, source: "database", state: cached!.retrievalState as BomStatus, parts: cached!.parts });
      continue;
    }

    try {
      // Deterministic Context Building
      const brand = cached?.brand || "Appliance";
      const applianceType = cached?.applianceType || "dryer";
      const serial = input.serial || "";
      
      const serialProfile = serial 
        ? await decodeSerialNumber(serial, { brand, model })
        : null;

      const candidateUrl = buildFixModelUrl({
        brand: brand,
        applianceType: applianceType,
        model: model,
      });

      const brandSlug = candidateUrl.split('/')[5] || "unknown";
      const applianceSlug = candidateUrl.split('/')[4] || "unknown";

      // 2. COUNT_AND_DIAGRAM_LOCATOR
      console.log(`[BatchOrchestrator] Locating BOM Frame for ${model} via ${candidateUrl}`);
      const locatorResult = await runStructuredJson<any>({
        model: "pro",
        prompt: COUNT_AND_DIAGRAM_LOCATOR
          .replace(/{{MODEL}}/g, model)
          .replace(/{{MAKE}}/g, brand)
          .replace(/{{FIX_BRAND_SLUG}}/g, brandSlug)
          .replace(/{{APPLIANCE_TYPE}}/g, applianceType)
          .replace(/{{FIX_APPLIANCE_SLUG}}/g, applianceSlug)
          .replace(/{{CANDIDATE_URL}}/g, candidateUrl)
          .replace(/{{SERIAL_OR_NULL}}/g, serial || "null")
          .replace(/{{MANUFACTURE_YEAR_OR_NULL}}/g, serialProfile?.selectedYear?.toString() || "null")
          .replace(/{{SERIAL_CONFIDENCE}}/g, serialProfile?.confidence || "low"),
        enableSearch: true,
        temperature: 0,
      });

      if (!locatorResult.found) {
        results.push({ model, state: "no_result", source: "ai_locator", parts: [] });
        continue;
      }

      const { totalPartsAvailable, diagrams, sourceUrl } = locatorResult;

      // 4. DIAGRAM_PARTS_EXTRACT
      const accumulatedParts: BomRow[] = [];
      const knownPartNumbers = (cached?.parts || []).map(p => p.originalPartNumber || p.currentServicePartNumber).filter(Boolean);

      for (const diag of diagrams) {
        console.log(`[BatchOrchestrator] Extracting Diagram: ${diag.diagramName}`);
        try {
          const extractResult = await runStructuredJson<any>({
            model: "fast",
            prompt: DIAGRAM_PARTS_EXTRACT
              .replace(/{{MODEL}}/g, model)
              .replace(/{{DIAGRAM_URL}}/g, diag.diagramUrl || sourceUrl)
              .replace(/{{DIAGRAM_NAME}}/g, diag.diagramName)
              .replace(/{{TOTAL_PARTS_AVAILABLE}}/g, String(totalPartsAvailable))
              .replace(/{{KNOWN_PART_NUMBERS_JSON}}/g, JSON.stringify(knownPartNumbers)),
            enableSearch: false,
            text: `Extracting ${diag.diagramName}`,
            temperature: 0,
          });

          if (extractResult.parts) {
            accumulatedParts.push(...extractResult.parts);
          }
        } catch (diagErr) {
          console.error(`[BatchOrchestrator] Diagram extraction failed for ${diag.diagramName}:`, diagErr);
        }
      }

      // 5. Merge & 6. Validate
      const { accepted, rejected } = validateLiveParts({
        model,
        applianceType: cached?.applianceType || null,
        fuelType: (cached?.fuelType || "other") as any,
        parts: accumulatedParts,
      });

      let finalParts = normalizeBomRows(accepted, { productType: cached?.applianceType });

      // 6a. Serial Applicability Filtering
      if (serial || serialProfile) {
        const applicability = filterPartsBySerialApplicability(finalParts, {
          serialNumber: serial,
          serialProfile: serialProfile,
        });
        
        // We return applicableParts and keep the rest as rejected/filtered context
        finalParts = applicability.applicableParts;
      }

      // 7. Price enrichment
      if (input.retrievalMode === 'parts_with_prices' && finalParts.length > 0) {
        finalParts = await enrichPartPrices(finalParts);
      }

      const newState = determineNewState({
        partsCount: finalParts.length,
        expectedTotal: totalPartsAvailable || 0,
      });

      await upsertModelPartsCache({
        model,
        parts: finalParts,
        retrievalState: newState,
        expectedPartsTotal: totalPartsAvailable || undefined,
        truthSource: locatorResult.source,
        sourceStrategy: 'diagram_split_orchestration',
      });

      results.push({
        model,
        state: newState,
        source: "diagram_orchestration",
        expectedPartsTotal: totalPartsAvailable,
        parts: finalParts,
      });

    } catch (error) {
      console.error(`[BatchOrchestrator] Orchestration failed for ${model}:`, error);
      results.push({ model, state: "failed", error: String(error) });
    }
  }

  return { results };
}

async function enrichPartPrices(parts: BomRow[]): Promise<BomRow[]> {
  const enrichedParts = [...parts];
  const chunkSize = 15;
  for (let i = 0; i < enrichedParts.length; i += chunkSize) {
    const chunk = enrichedParts.slice(i, i + chunkSize);
    const partNumbers = chunk.map(p => p.originalPartNumber || p.currentServicePartNumber).filter(Boolean);

    try {
      const enrichment = await runStructuredJson<any>({
        model: "fast",
        prompt: PRICE_PROMPT_RETAIL_ENRICHMENT,
        text: `Enriching: ${partNumbers.join(", ")}`,
        temperature: 0,
        enableSearch: true,
      });

      if (enrichment.enrichments) {
        for (const item of enrichment.enrichments) {
          const index = enrichedParts.findIndex(p => 
            (p.originalPartNumber === item.partNumber || p.currentServicePartNumber === item.partNumber)
          );
          if (index !== -1 && item.price) {
            enrichedParts[index] = {
              ...enrichedParts[index],
              retailPrice: item.price,
              retailPriceSource: item.priceSource,
              retailAvailability: item.availability,
              retailPricingUrl: item.url,
              retailPriceVerified: true,
              retailPricedAt: new Date().toISOString(),
            };
          }
        }
      }
    } catch (err) {
      console.error(`[PriceEnrichment] Failed chunk ${i}:`, err);
    }
  }
  return enrichedParts;
}

function determineNewState(input: { partsCount: number; expectedTotal: number }): BomStatus {
  if (input.partsCount === 0) return "no_result";
  if (input.expectedTotal > 0) {
    const ratio = input.partsCount / input.expectedTotal;
    if (ratio >= 0.95) return "bom_complete";
    if (ratio >= 0.7) return "bom_near_complete";
    return "parts_partial";
  }
  return "summary_only";
}
