import { buildBomIdentityContext } from "./build-bom-identity-context";
import { runIdentityExtraction, runIdentityNormalization } from "../agents/identity-extractor";
import { runDiagramParser } from "../agents/diagram-parser";
import { runPartsExtractor } from "../agents/parts-extractor";
import { runMsrpDiscovery } from "../agents/msrp-finder";
import { runSeedIntake } from "../agents/seed-intake";
import { runSourceLookup } from "../agents/source-lookup";
import { fetchSources } from "../services/source-fetcher";
import { normalizeBomRows } from "./bom-normalizer";
import { enrichBomRowsWithRetailPricing } from "../services/retail-pricing";
import { computeUnmatchedCallouts, calculateCompletionProof, validate_bom_completion } from "./bom-validator";
import { coverageScore } from "./coverage-scorer";
import type { BomRow, Identity, BomResult, DiagramParse, Clue, NormalizedIdentity, BuildBomJobState, BomStatus, RetrievalState } from "../schemas/bom";
import { ApplianceDecoder } from "@/lib/decoder";
import { logger } from "@/lib/logger";
import { runWithConcurrency } from "../services/utils";
import { type ProviderSourceType } from "../services/providers/types";
import fs from "fs/promises";
import path from "path";

export type BuildBomJobOutput = {
  result: BomResult;
  identity: Identity;
  identityContext: any;
  diagramParse: DiagramParse | null;
  retrievedSources: Array<{
    sourceUrl: string;
    sourceType: ProviderSourceType;
    provider: string;
    text: string;
    sectionName?: string;
    sectionOriginal?: string;
    meta?: Record<string, unknown>;
  }>;
  extractedRowsRaw: BomRow[];
  finalRows: BomRow[];
  seedRows?: BomRow[];
};

export async function buildBomJob(input: {
  identityFiles: Array<{ mimeType: string; uri: string }>;
  diagramFiles?: Array<{ mimeType: string; uri: string }>;
  userHints?: { brand?: string; model?: string; serial?: string; productType?: string };
  mode?: "identity" | "full";
  onStage?: (stage: string) => Promise<void> | void;
  onPartialResult?: (output: Partial<BuildBomJobOutput>) => Promise<void> | void;
  onNotice?: (notice: { type: "info" | "success" | "warning" | "error"; stage: string; message: string }) => Promise<void> | void;
  seedRows?: BomRow[];
  jobId?: string;
  knownRouteUrl?: string;
  ocrText?: string;
}): Promise<BuildBomJobOutput> {
  const mode = input.mode ?? "full";
  const stateFilePath = input.jobId ? path.join(process.cwd(), "scratch", `state_${input.jobId}.json`) : null;

  async function persistState(state: BuildBomJobState) {
    if (stateFilePath) {
      await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2));
    }
  }

  let state: BuildBomJobState = {
    retrievalState: "no_result",
    nextRequiredStep: "stage0_seed_intake",
    identity: null,
    normalizedIdentity: null,
    trustedSources: [],
    rejectedSources: [],
    expectedPartCount: null,
    actualPartCount: 0,
    requiredPriceCount: 0,
    verifiedPriceCount: 0,
    unpricedCount: 0,
    coverageRatio: null,
    paginationComplete: false,
    bomRows: [],
    errors: [],
    notices: []
  };

  async function emitNotice(type: "info" | "success" | "warning" | "error", stage: string, message: string) {
    logger[type === "error" ? "error" : type === "warning" ? "warn" : "info"](`[Notice: ${stage}] ${message}`);
    state.notices.push({ type, stage, message });
    await persistState(state);
    if (input.onNotice) {
      await input.onNotice({ type, stage, message });
    }
  }

  // STAGE 0: Source/Seed Intake
  await input.onStage?.("stage0_seed_intake");
  const seedResult = await runSeedIntake({
    ocrText: input.ocrText,
    manualModel: input.userHints?.model,
    manualFiles: input.diagramFiles,
    knownRouteUrl: input.knownRouteUrl,
  });
  
  if (seedResult.seed_lookup_result?.found) {
    state.trustedSources.push(seedResult.seed_lookup_result.sourceUrl!);
    await emitNotice("success", "stage0_seed_intake", `Found known seed URL: ${seedResult.seed_lookup_result.sourceUrl}`);
  } else {
    await emitNotice("info", "stage0_seed_intake", "No high-confidence initial seed URL found. Proceeding with standard extraction.");
  }
  
  state.retrievalState = "stage0_seed_intake";
  state.nextRequiredStep = "identity_extraction";
  await persistState(state);

  // STAGE 1: Identity Extraction
  await input.onStage?.("identity_extraction");
  const extractionResult = await runIdentityExtraction({
    files: input.identityFiles,
    userHints: input.userHints,
  });
  
  if (extractionResult.status === "failed") {
    state.retrievalState = "failed";
    await emitNotice("error", "identity_extraction", "Identity extraction failed. No usable clues found in the input data.");
    await persistState(state);
    throw new Error("Identity extraction failed.");
  }

  // Handle manual review flags if present (assuming the updated agent returns them in the rawText or a separate field, or we extract them if we map them later)
  const anyExtraction: any = extractionResult;
  if (anyExtraction.manual_review_flags && anyExtraction.manual_review_flags.length > 0) {
    await emitNotice("warning", "identity_extraction", `Manual review flags raised: ${anyExtraction.manual_review_flags.join(", ")}`);
  }

  await emitNotice("success", "identity_extraction", `Successfully extracted identity for model: ${extractionResult.candidate_identity.model}`);

  state.identity = extractionResult;
  state.retrievalState = "identity_extraction";
  state.nextRequiredStep = "identity_normalization";
  await persistState(state);

  // STAGE 2: Identity Normalization
  await input.onStage?.("identity_normalization");
  const normalizedIdentity = await runIdentityNormalization(extractionResult);
  
  if (normalizedIdentity.status !== "success") {
    state.retrievalState = "failed";
    await emitNotice("error", "identity_normalization", "Failed to normalize identity clues to a known OEM brand/family.");
    await persistState(state);
    throw new Error("Identity normalization failed.");
  }

  const anyNormalized: any = normalizedIdentity;
  if (anyNormalized.manual_review_flags && anyNormalized.manual_review_flags.length > 0) {
    await emitNotice("warning", "identity_normalization", `Normalization flagged issues: ${anyNormalized.manual_review_flags.join(", ")}`);
  }

  await emitNotice("success", "identity_normalization", `Normalized identity to Brand: ${normalizedIdentity.brand}, Model: ${normalizedIdentity.model}`);

  state.normalizedIdentity = normalizedIdentity;
  state.retrievalState = "identity_only";
  state.nextRequiredStep = "source_lookup";
  await persistState(state);

  // TRUSTED SOURCE LOOKUP (Optional/Triggered)
  if (state.trustedSources.length === 0) {
    await input.onStage?.("source_lookup");
    const lookup = await runSourceLookup(normalizedIdentity as any, state.trustedSources);
    state.trustedSources.push(...lookup.acceptedSources);
    state.rejectedSources.push(...lookup.rejectedSources);
    
    if (lookup.acceptedSources.length > 0) {
      await emitNotice("success", "source_lookup", `Found ${lookup.acceptedSources.length} trusted source(s) via automated lookup.`);
    } else {
      await emitNotice("warning", "source_lookup", `No trusted sources found for model ${normalizedIdentity.model}. Retrieval may fail or have low coverage.`);
    }
  }

  state.retrievalState = "sources_resolved";
  await persistState(state);

  const identity: Identity = {
    brand: normalizedIdentity.brand,
    model: normalizedIdentity.model,
    productType: normalizedIdentity.manufacturer_family,
    applianceType: normalizedIdentity.appliance_type,
    fuelType: (normalizedIdentity.fuel_type as any) || null,
    rawText: extractionResult.raw_text,
    serial: normalizedIdentity.serial || (input.userHints?.serial as string) || null,
    confidence: 0.9,
  };

  const identityContext = await buildBomIdentityContext(identity);
  
  // DECODE SERIAL for manufacture date (Integration with ApplianceDecoder)
  const decoder = new ApplianceDecoder();
  const decodeResult = decoder.decode(identity.serial || "", identity.model || "");
  let manufactureDate: string | null = null;
  if (decodeResult.manufactureYear && decodeResult.timeValue) {
    const month = decodeResult.timeValue.unit === "month" ? decodeResult.timeValue.value : Math.ceil(decodeResult.timeValue.value / 4.3);
    manufactureDate = `${decodeResult.manufactureYear}-${String(month).padStart(2, "0")}-01`;
    await emitNotice("info", "identity_normalization", `Decoded manufacture date: ${manufactureDate} (${decodeResult.confidence} confidence)`);
  }
  identity.manufactureDate = manufactureDate;

  await input.onPartialResult?.({ identity, identityContext });
  if (mode === "identity") {
    return {
      result: {} as any,
      identity,
      identityContext,
      diagramParse: null,
      retrievedSources: [],
      extractedRowsRaw: [],
      finalRows: [],
    };
  }

  // STAGE 3: Parallel Parts Extraction
  await input.onStage?.("parallel_parts_extraction");
  const retrievedSources = await fetchSources({
    brand: identity.brand,
    model: identity.model,
    productType: identity.productType,
  });

  const extractionResults = await runWithConcurrency(
    retrievedSources,
    parseInt(process.env.BOM_EXTRACTOR_CONCURRENCY ?? "3", 10),
    async (source: any) => {
      if (source.meta?.exactModelMatch === false) return null;

      try {
        const result = await runPartsExtractor({
          sourceUrl: source.sourceUrl,
          sourceType: source.sourceType,
          provider: source.provider,
          sourceText: source.text,
          modelNumber: identity.model || "UNKNOWN",
          applianceType: (identity as any).applianceType,
          fuelType: (identity as any).fuelType,
        });
        
        await emitNotice("success", "parallel_parts_extraction", `Worker [${source.provider}] successfully extracted ${result.rows.length} rows.`);
        
        const anyResult: any = result;
        if (anyResult.manual_review_flags && anyResult.manual_review_flags.length > 0) {
          await emitNotice("warning", "parallel_parts_extraction", `Worker [${source.provider}] flagged items for manual review: ${anyResult.manual_review_flags.join(", ")}`);
        }
        if (anyResult.shortfall_reason) {
          await emitNotice("warning", "parallel_parts_extraction", `Worker [${source.provider}] reported a shortfall: ${anyResult.shortfall_reason}`);
        }
        if (anyResult.source_total_part_count) {
          await emitNotice("info", "parallel_parts_extraction", `Worker [${source.provider}] discovered total expected part count: ${anyResult.source_total_part_count}`);
        }
        
        return result;
      } catch (err) {
        logger.error(`Extraction failed for ${source.sourceUrl}:`, err);
        await emitNotice("error", "parallel_parts_extraction", `Worker [${source.provider}] failed to extract parts: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    }
  );

  const validResults = extractionResults.filter(Boolean) as any[];
  const extractedRowsRaw = validResults.flatMap(r => r.rows);
  
  // Update state with part count discovery
  const firstCountResult = validResults.find(r => r.expectedPartCount !== null);
  if (firstCountResult) {
    state.expectedPartCount = firstCountResult.expectedPartCount;
  }
  state.paginationComplete = validResults.every(r => r.paginationComplete);
  
  state.retrievalState = "parts_partial";
  state.nextRequiredStep = "bom_synthesis";
  await persistState(state);

  // STAGE 4: BOM Synthesis
  await input.onStage?.("bom_synthesis");
  const finalRows = normalizeBomRows(extractedRowsRaw, {
    productType: identity.productType || input.userHints?.productType
  });
  
  state.retrievalState = "bom_synthesis";
  state.bomRows = finalRows;
  
  // Calculate coverage if expectedPartCount is known
  if (state.expectedPartCount !== null && state.expectedPartCount > 0) {
    state.coverageRatio = finalRows.length / state.expectedPartCount;
  } else {
    // Rule: IF expectedPartCount is 0 or null (unknown)
    // require >= 40 parts AND >= 2 independent sources for "success"
    const uniqueSources = new Set(extractedRowsRaw.map(r => r.sourceUrl)).size;
    const hasEnoughParts = finalRows.length >= 40;
    const hasEnoughSources = uniqueSources >= 2;
    
    if (hasEnoughParts && hasEnoughSources) {
      state.coverageRatio = 1.0;
    } else {
      state.coverageRatio = finalRows.length / 40;
      if (!hasEnoughSources && state.expectedPartCount === null) {
        await emitNotice("warning", "bom_synthesis", "BOM is missing an expectedPartCount and only has one source. Coverage is considered weak.");
      }
    }
  }

  const finalSectionsFound = [...new Set(finalRows.map((r) => r.section))];

  // Coverage Validation & Diagram Parsing
  const hasUserDiagramFiles = (input.diagramFiles?.length ?? 0) > 0;
  const diagramParse = hasUserDiagramFiles ? await runDiagramParser(input.diagramFiles!) : null;
  const unmatchedCallouts = hasUserDiagramFiles ? computeUnmatchedCallouts(diagramParse, finalRows) : [];

  // STAGE 5: Verified Retail Pricing
  await input.onStage?.("retail_pricing_discovery");
  const pricingResult = await enrichBomRowsWithRetailPricing({
    brand: identity.brand,
    model: identity.model,
    rows: finalRows,
  });
  
  const finalPricedRows = pricingResult.rows;
  state.bomRows = finalPricedRows;

  // Final Validation Gate
  const completion = validate_bom_completion({
    rows: finalPricedRows,
    expectedPartCount: state.expectedPartCount,
    identityResolved: true,
  });

  state.retrievalState = completion.retrievalState;
  state.actualPartCount = completion.actualPartCount;
  state.requiredPriceCount = completion.requiredPriceCount;
  state.verifiedPriceCount = completion.verifiedPriceCount;
  state.unpricedCount = completion.unpricedCount;
  
  await emitNotice(
    completion.bomComplete ? "success" : "warning",
    "retail_pricing_discovery",
    `BOM Completion: ${completion.bomComplete ? "COMPLETE" : "INCOMPLETE"}. Status: ${completion.retrievalState}. Prices: ${completion.verifiedPriceCount}/${completion.actualPartCount}`
  );
  
  await persistState(state);

  // STAGE 5: MSRP Discovery
  await input.onStage?.("msrp_discovery");
  const msrpResult = await runMsrpDiscovery({
    brand: identity.brand,
    model: identity.model,
    manufactureDate: identity.manufactureDate || null,
  });
  
  if (msrpResult.amount) {
    await emitNotice("success", "msrp_discovery", `Discovered original MSRP: $${msrpResult.amount} (${msrpResult.confidence} confidence)`);
  } else {
    await emitNotice("info", "msrp_discovery", `Could not discover original MSRP: ${msrpResult.evidence}`);
  }

  const result: BomResult = {
    brand: identity.brand,
    model: identity.model,
    serial: identity.serial,
    productType: identity.productType,
    manufactureDate: identity.manufactureDate,
    msrp: msrpResult,
    sectionsFound: finalSectionsFound,
    rawRowCount: extractedRowsRaw.length,
    uniqueRowCount: finalRows.length,
    unmatchedCallouts: unmatchedCallouts.map(String),
    status: state.retrievalState,
    retrievalState: state.retrievalState,
    expectedPartCount: state.expectedPartCount,
    actualPartCount: state.actualPartCount,
    requiredPriceCount: state.requiredPriceCount,
    verifiedPriceCount: state.verifiedPriceCount,
    unpricedCount: state.unpricedCount,
    bomComplete: completion.bomComplete,
    partsComplete: completion.partsComplete,
    pricingComplete: completion.pricingComplete,
    rows: state.bomRows,
    issues: pricingResult.issues,
    notices: state.notices,
    coverageScore: state.coverageRatio ?? 0,
    truthSource: retrievedSources.length > 0 ? retrievedSources[0].sourceUrl : null,
    sourceStrategy: retrievedSources.length > 0 ? "deterministic-provider" : "ai-grounded-synthesis",
    completionProof: state.expectedPartCount !== null ? {
      expectedPartCount: state.expectedPartCount,
      totalExtracted: finalRows.length,
      coverageRatio: state.coverageRatio!,
      sourceAgreement: true,
    } : undefined
  };

  state.nextRequiredStep = "done";
  await persistState(state);

  return {
    result,
    identity,
    identityContext,
    diagramParse,
    retrievedSources,
    extractedRowsRaw,
    finalRows,
    seedRows: input.seedRows,
  };
}
