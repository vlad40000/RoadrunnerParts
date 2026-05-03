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

  // CACHE LOOKUP: Check if we have this model cached
  const targetModel = input.userHints?.model || job.model;
  if (mode === 'full' && targetModel) {
    const { findCachedModelParts } = await import('../services/model-parts-cache');
    const cached = await findCachedModelParts(targetModel);
    
    if (cached) {
      console.log(`[ModelPartsCache] Serving ${cached.parts.length} parts from cache for ${targetModel}`);
      
      await saveBomArtifacts(input.jobId, {
        identity: {
          brand: cached.brand,
          model: cached.normalizedModel,
          category: cached.category,
        },
        finalRows: cached.parts,
        issues: ["Restored from persistent model cache."],
      });

      await completeBomJob(input.jobId, {
        brand: cached.brand || 'Unknown',
        model: cached.normalizedModel,
        serial: null,
        productType: cached.category || null,
        rawRowCount: cached.parts.length,
        uniqueRowCount: cached.parts.length,
        coverageScore: 1,
        resultStatus: 'cache_hit',
        issues: ["Restored from persistent model cache."],
        unmatchedCallouts: [],
        finalRows: cached.parts,
      });

      return {
        brand: cached.brand,
        model: cached.normalizedModel,
        status: 'cache_hit',
        uniqueRowCount: cached.parts.length,
      };
    }
  }

  try {
    await setBomJobStage(input.jobId, "queued");

    const output = await buildBomJob({
      identityFiles,
      diagramFiles,
      userHints: input.userHints ?? {},
      mode,
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
              model: partialOutput.result.normalized_model,
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
        model: output.identity?.normalized_model ?? null,
        serial: output.identity?.serial ?? null,
        productType: output.identity?.product_type ?? null,
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
      })),
      extractedRowsRaw: output.extractedRowsRaw as Array<Record<string, unknown>>,
      finalRows: output.finalRows as Array<Record<string, unknown>>,
      unmatchedCallouts: output.result.unmatchedCallouts,
      issues: output.result.issues,
    });

    await completeBomJob(input.jobId, {
      brand: output.result.brand,
      model: output.result.normalized_model,
      serial: output.result.serial,
      productType: output.result.product_type,
      rawRowCount: output.result.rawRowCount,
      uniqueRowCount: output.result.uniqueRowCount,
      coverageScore: output.result.coverageScore,
      resultStatus: output.result.status,
      issues: output.result.issues,
      unmatchedCallouts: output.result.unmatchedCallouts,
      finalRows: output.finalRows as Array<Record<string, unknown>>,
    });

    // BACKGROUND CACHE UPSERT: Store results if successful
    if (mode === 'full' && output.result.normalized_model && output.finalRows?.length > 0) {
      const { upsertModelPartsCache } = await import('../services/model-parts-cache');
      upsertModelPartsCache({
        model: output.result.normalized_model,
        parts: output.finalRows,
        brand: output.result.brand,
        category: output.result.product_type,
      }).catch(err => console.error("[ModelPartsCache] Background upsert failed:", err));
    }

    return output.result;
  } catch (error) {
    const message = sanitizeStoredErrorMessage(error);

    await failBomJob(input.jobId, message);
    throw error;
  }
}
