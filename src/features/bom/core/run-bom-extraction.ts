import "server-only";
import { buildBomJob } from "./bom-orchestrator";
import {
  completeBomJob,
  failBomJob,
  getBomJob,
  saveBomArtifacts,
  setBomJobStage,
} from "../services/job-store";

function sanitizeStoredErrorMessage(error: unknown) {
  const raw =
    error instanceof Error ? error.message : String(error || "Extraction failed");

  const text = raw.trim();

  const looksLikeHtml =
    /^<!doctype html/i.test(text) ||
    /^<html/i.test(text) ||
    /<title>\s*500/i.test(text) ||
    /Internal Server Error/i.test(text) ||
    /__NEXT_DATA__/i.test(text);

  if (looksLikeHtml) {
    return "Extraction failed: upstream source returned an unexpected HTML error page.";
  }

  return text.slice(0, 500);
}

export async function runAndPersistBomExtraction(input: {
  jobId: string;
  mode?: "identity" | "full";
  userHints?: {
    brand?: string;
    model?: string;
    serial?: string;
    productType?: string;
  };
}) {
  const job = await getBomJob(input.jobId);

  if (!job) {
    throw new Error("BOM job not found");
  }

  const identityFiles = job.uploadedFiles
    .filter((f) => f.category === "identity")
    .map((f) => ({
      mimeType: f.mimeType,
      uri: f.url,
    }));

  const diagramFiles = job.uploadedFiles
    .filter((f) => f.category === "diagram")
    .map((f) => ({
      mimeType: f.mimeType,
      uri: f.url,
    }));

  const mode = input.mode ?? "full";
  let seedRows: any[] | undefined;

  // CACHE LOOKUP: Check if we have this model cached
  const targetModel = input.userHints?.model || job.model;
  if (mode === 'full' && targetModel) {
    const { findCachedModelParts } = await import('../services/model-parts-cache');
    const cached = await findCachedModelParts(targetModel);
    
    // USABLE CACHE CHECK:
    // 1. Must have parts
    // 2. State must be bom_complete or parts_partial
    const isComplete = cached && cached.parts.length > 0 && ['bom_complete', 'bom_near_complete'].includes(cached.retrievalState || '');
    const isPartial = cached && cached.parts.length > 0 && cached.retrievalState === 'parts_partial';

    if (isComplete) {
      console.log(`[ModelPartsCache] Serving ${cached.parts.length} parts from cache for ${targetModel} (State: ${cached.retrievalState})`);
      
      const coverage = cached.coveragePct ?? (cached.retrievalState === 'bom_complete' ? 1 : 0.5);

      await saveBomArtifacts(input.jobId, {
        identity: {
          brand: cached.brand,
          model: cached.normalizedModel,
          category: cached.category,
        },
        finalRows: cached.parts,
        issues: [`Restored from persistent model cache (${cached.retrievalState}).`],
      });

      await completeBomJob(input.jobId, {
        brand: cached.brand || 'Unknown',
        model: cached.normalizedModel,
        serial: null,
        productType: cached.category || null,
        rawRowCount: cached.parts.length,
        uniqueRowCount: cached.actualUniqueParts ?? cached.parts.length,
        coverageScore: coverage,
        resultStatus: cached.retrievalState === 'bom_complete' ? 'cache_hit' : (cached.retrievalState as any),
        issues: [`Restored from persistent model cache (${cached.retrievalState}).`],
        unmatchedCallouts: [],
        finalRows: cached.parts,
      });

      return {
        brand: cached.brand,
        model: cached.normalizedModel,
        status: cached.retrievalState === 'bom_complete' ? 'cache_hit' : (cached.retrievalState as any),
        uniqueRowCount: cached.parts.length,
      };
    }

    // PARTIAL RESUMPTION:
    if (isPartial) {
      console.log(`[ModelPartsCache] Resuming from parts_partial cache for ${targetModel} (${cached.parts.length} verified rows)`);
      seedRows = cached.parts;
    }
  }

  try {
    await setBomJobStage(input.jobId, "queued");

    const output = await buildBomJob({
      identityFiles,
      diagramFiles,
      userHints: input.userHints ?? {},
      mode,
      seedRows,
      onStage: async (stage) => {
        await setBomJobStage(input.jobId, stage);
      },
      onPartialResult: (partialOutput) => {
        // FAST DB SAVE: Only update status, counts, and identity. 
        // DO NOT save `partialOutput.finalRows` or `extractedRowsRaw` here.
        (async () => {
          if (partialOutput.result) {
            const { updateJobSummary } = await import("../services/job-store");
            await updateJobSummary(input.jobId, {
              jobStage: partialOutput.result.status ?? "synthesis_complete", 
              brand: partialOutput.result.brand,
              model: partialOutput.result.model,
              uniqueRowCount: partialOutput.result.uniqueRowCount,
            });
          }
        })().catch(err => console.error("Fast partial save failed:", err));
      }
    });

    if (mode === "identity") {
      await saveBomArtifacts(input.jobId, {
        identity: output.identityContext
          ? (output.identityContext as Record<string, unknown>)
          : output.identity
            ? (output.identity as Record<string, unknown>)
            : null,
        issues: output.result.issues,
      });

      await setBomJobStage(input.jobId, "identity_review");

      return {
        brand: output.identity?.brand ?? null,
        model: output.identity?.model ?? null,
        serial: output.identity?.serial ?? null,
        productType: output.identity?.productType ?? null,
        identity: output.identityContext ?? output.identity,
        issues: output.result.issues,
      };
    }

    await saveBomArtifacts(input.jobId, {
      identity: output.identityContext
        ? (output.identityContext as Record<string, unknown>)
        : output.identity
          ? (output.identity as Record<string, unknown>)
          : null,
      diagramParse: output.diagramParse as Record<string, unknown>,
      retrievedSources: output.retrievedSources.map((s) => ({
        sourceUrl: s.sourceUrl,
        sourceType: s.sourceType,
        sectionName: s.sectionName,
        text: s.text,
        meta: s.meta,
      })),
      extractedRowsRaw: output.extractedRowsRaw as Array<Record<string, unknown>>,
      finalRows: output.finalRows as Array<Record<string, unknown>>,
      unmatchedCallouts: output.result.unmatchedCallouts,
      issues: output.result.issues,
    });

    await completeBomJob(input.jobId, {
      brand: output.result.brand,
      model: output.result.model,
      serial: output.result.serial,
      productType: output.result.productType,
      rawRowCount: output.result.rawRowCount,
      uniqueRowCount: output.result.uniqueRowCount,
      coverageScore: output.result.coverageScore,
      resultStatus: output.result.status,
      issues: output.result.issues,
      unmatchedCallouts: output.result.unmatchedCallouts,
      truthSource: output.result.truthSource,
      sourceStrategy: output.result.sourceStrategy,
      expectedPartsTotal: output.result.expectedPartsTotal,
      expectedPartsSource: output.result.expectedPartsSource,
      trustedTotalPartCount: output.result.trustedTotalPartCount,
      trustedTotalCountSource: output.result.trustedTotalCountSource,
      trustedTotalCountSourceUrl: output.result.trustedTotalCountSourceUrl,
      trustedTotalCountCheckedAt: output.result.trustedTotalCountCheckedAt,
      finalRows: output.finalRows as Array<Record<string, unknown>>,
      retrievalState: output.result.retrievalState,
      expectedPartCount: output.result.expectedPartCount,
      actualPartCount: output.result.actualPartCount,
      actualCanonicalPartCount: output.result.actualCanonicalPartCount,
      requiredPriceCount: output.result.requiredPriceCount,
      verifiedPriceCount: output.result.verifiedPriceCount,
      unpricedCount: output.result.unpricedCount,
      bomComplete: output.result.bomComplete,
      partsComplete: output.result.partsComplete,
      pricingComplete: output.result.pricingComplete,
    });

    // BACKGROUND CACHE UPSERT: Store results if successful
    if (mode === 'full' && output.result.model && output.finalRows?.length > 0) {
      const { upsertModelPartsCache } = await import('../services/model-parts-cache');
      upsertModelPartsCache({
        model: output.result.model,
        parts: output.finalRows,
        brand: output.result.brand,
        category: output.result.productType,
        retrievalState: output.result.status,
        expectedPartsTotal: output.result.expectedPartsTotal,
        expectedPartsSource: output.result.expectedPartsSource ?? undefined,
        trustedTotalPartCount: output.result.trustedTotalPartCount ?? undefined,
        trustedTotalCountSource: output.result.trustedTotalCountSource ?? undefined,
        trustedTotalCountSourceUrl: output.result.trustedTotalCountSourceUrl ?? undefined,
        trustedTotalCountCheckedAt: output.result.trustedTotalCountCheckedAt ?? undefined,
        actualCanonicalPartCount: output.result.actualCanonicalPartCount,
        partsComplete: output.result.partsComplete,
        actualUniqueParts: output.result.uniqueRowCount,
        coveragePct: output.result.coverageScore,
        sourceStrategy: output.result.sourceStrategy,
      }).catch(err => console.error("[ModelPartsCache] Background upsert failed:", err));
    }

    return output.result;
  } catch (error) {
    const message = sanitizeStoredErrorMessage(error);

    await failBomJob(input.jobId, message);
    throw error;
  }
}
