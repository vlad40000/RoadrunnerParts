import "server-only";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/server/db";
import { bomJobs } from "@/src/server/db/schema/bom-jobs";
import { applianceModels } from "@/src/server/db/schema/appliance-models";
import { normalizeBomStatus } from "../core/bom-status";
import { uploadSourceEvidence } from "./blob-store";
import { normalizeCanonicalModel } from "./source-tier-policy";

export type UploadedBomFile = {
  url: string;
  pathname: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: "identity" | "diagram";
};

export async function createBomJob() {
  const id = crypto.randomUUID();
  await db
    .insert(bomJobs)
    .values({
      id,
      jobStage: "created",
    });

  return getBomJob(id);
}

export async function createOrReuseBomJob(input: {
  model?: string | null;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
}) {
  const model = String(input.model || "").trim().toUpperCase();

  if (!model) {
    return createBomJob();
  }

  const existing = await db
    .select()
    .from(bomJobs)
    .where(eq(bomJobs.model, model))
    .limit(1);

  if (existing[0]) {
    await db
      .update(bomJobs)
      .set({
        brand: input.brand ?? existing[0].brand,
        serial: input.serial ?? existing[0].serial,
        productType: input.productType ?? existing[0].productType,
        updatedAt: new Date(),
      })
      .where(eq(bomJobs.id, existing[0].id));

    return getBomJob(existing[0].id);
  }

  const job = await createBomJob();
  if (!job) return null;

  await db
    .update(bomJobs)
    .set({
      model,
      brand: input.brand ?? null,
      serial: input.serial ?? null,
      productType: input.productType ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, job.id));

  return getBomJob(job.id);
}

export async function getBomJob(jobId: string) {
  const [job] = await db
    .select()
    .from(bomJobs)
    .where(eq(bomJobs.id, jobId))
    .limit(1);

  return job ?? null;
}

export async function listBomJobs(limit = 50) {
  return db
    .select()
    .from(bomJobs)
    .orderBy(desc(bomJobs.createdAt))
    .limit(limit);
}

export async function setBomJobStage(jobId: string, jobStage: string) {
  await db
    .update(bomJobs)
    .set({
      jobStage,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function attachFilesToBomJob(
  jobId: string,
  files: UploadedBomFile[],
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  await db
    .update(bomJobs)
    .set({
      uploadedFiles: [...job.uploadedFiles, ...files],
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function saveBomArtifacts(
  jobId: string,
  partial: {
    identity?: Record<string, unknown> | null;
    diagramParse?: Record<string, unknown> | null;
    retrievedSources?: Array<{
      sourceUrl: string;
      sourceType: string;
      sectionName?: string;
      text?: string;
      blobUrl?: string;
    }>;
    extractedRowsRaw?: Array<Record<string, unknown>>;
    finalRows?: Array<Record<string, unknown>>;
    unmatchedCallouts?: Array<string | number>;
    issues?: string[];
  },
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  // NEW: Offload large source evidence to Vercel Blob
  let finalSources = partial.retrievedSources;
  if (finalSources) {
    finalSources = await Promise.all(
      finalSources.map(async (s) => {
        // If it's a heavy text blob (> 1000 chars), move it to Vercel Blob
        if (s.text && s.text.length > 1000) {
          try {
            const blobUrl = await uploadSourceEvidence(jobId, s.text);
            return {
              ...s,
              text: undefined, // Clear from DB
              blobUrl,
            };
          } catch (err) {
            console.warn(`[JobStore] Blob upload failed for source, keeping in DB:`, err);
            return s;
          }
        }
        return s;
      })
    );
  }

  await db
    .update(bomJobs)
    .set({
      identity: partial.identity ?? job.identity,
      diagramParse: partial.diagramParse ?? job.diagramParse,
      retrievedSources: finalSources ?? job.retrievedSources,
      extractedRowsRaw: partial.extractedRowsRaw ?? job.extractedRowsRaw,
      finalRows: partial.finalRows ?? job.finalRows,
      unmatchedCallouts: partial.unmatchedCallouts ?? job.unmatchedCallouts,
      issues: partial.issues ?? job.issues,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function updateBomJobSummary(
  jobId: string,
  partial: {
    jobStage?: string;
    resultStatus?: string | null;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
    productType?: string | null;
    rawRowCount?: number;
    uniqueRowCount?: number;
    coverageScore?: number;
    actualUniqueParts?: number | null;
    coveragePct?: number | null;
    expectedPartsTotal?: number | null;
    expectedPartsSource?: string | null;
    expectedPartCount?: number | null;
    actualPartCount?: number | null;
    actualCanonicalPartCount?: number | null;
    verifiedPriceCount?: number | null;
    requiredPriceCount?: number | null;
    unpricedCount?: number | null;
    partsComplete?: boolean | null;
    pricingComplete?: boolean | null;
    retrievalState?: string | null;
    truthSource?: string | null;
    sourceStrategy?: string | null;
    bomComplete?: boolean | string | null;
    trustedTotalPartCount?: number | null;
    trustedTotalCountSource?: string | null;
    trustedTotalCountSourceUrl?: string | null;
    trustedTotalCountCheckedAt?: Date | string | null;
    errorText?: string | null;
    requiresApproval?: boolean | null;
    approvalStatus?: string | null;
  },
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  await db
    .update(bomJobs)
    .set({
      jobStage: partial.jobStage ?? job.jobStage,
      resultStatus: partial.resultStatus ?? job.resultStatus,
      brand: partial.brand ?? job.brand,
      model: partial.model ?? job.model,
      serial: partial.serial ?? job.serial,
      productType: partial.productType ?? job.productType,
      rawRowCount: partial.rawRowCount ?? job.rawRowCount,
      uniqueRowCount: partial.uniqueRowCount ?? job.uniqueRowCount,
      coverageScore: partial.coverageScore ?? job.coverageScore,
      actualUniqueParts: partial.actualUniqueParts ?? job.actualUniqueParts,
      coveragePct: partial.coveragePct ?? job.coveragePct,
      expectedPartsTotal: partial.expectedPartsTotal ?? job.expectedPartsTotal,
      expectedPartsSource: partial.expectedPartsSource ?? job.expectedPartsSource,
      expectedPartCount: partial.expectedPartCount ?? job.expectedPartCount,
      actualPartCount: partial.actualPartCount ?? job.actualPartCount,
      actualCanonicalPartCount: partial.actualCanonicalPartCount ?? job.actualCanonicalPartCount,
      verifiedPriceCount: partial.verifiedPriceCount ?? job.verifiedPriceCount,
      requiredPriceCount: partial.requiredPriceCount ?? job.requiredPriceCount,
      unpricedCount: partial.unpricedCount ?? job.unpricedCount,
      partsComplete: partial.partsComplete ?? job.partsComplete,
      pricingComplete: partial.pricingComplete ?? job.pricingComplete,
      retrievalState: partial.retrievalState ?? job.retrievalState,
      truthSource: partial.truthSource ?? job.truthSource,
      sourceStrategy: partial.sourceStrategy ?? job.sourceStrategy,
      bomComplete: partial.bomComplete !== undefined ? String(partial.bomComplete) : job.bomComplete,
      trustedTotalPartCount: partial.trustedTotalPartCount ?? job.trustedTotalPartCount,
      trustedTotalCountSource: partial.trustedTotalCountSource ?? job.trustedTotalCountSource,
      trustedTotalCountSourceUrl: partial.trustedTotalCountSourceUrl ?? job.trustedTotalCountSourceUrl,
      trustedTotalCountCheckedAt: partial.trustedTotalCountCheckedAt 
        ? new Date(partial.trustedTotalCountCheckedAt) 
        : job.trustedTotalCountCheckedAt,
      errorText: partial.errorText ?? job.errorText,
      requiresApproval: partial.requiresApproval ?? job.requiresApproval,
      approvalStatus: partial.approvalStatus ?? job.approvalStatus,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

// Alias for compatibility with new supervisor refactor
export const updateJobSummary = updateBomJobSummary;

export async function completeBomJob(
  jobId: string,
  result: {
    brand: string | null;
    model: string | null;
    serial: string | null;
    productType: string | null;
    rawRowCount: number;
    uniqueRowCount: number;
    coverageScore: number;
    resultStatus: string;
    issues: string[];
    unmatchedCallouts: Array<string | number>;
    finalRows: Array<Record<string, unknown>>;
  },
) {
  const normalizedStatus = normalizeBomStatus(
    result.resultStatus,
    result.uniqueRowCount,
  );

  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found for completion");

  // Cleanup: Scrub the large raw text blobs from sources to save space/payload
  const scrubbedSources = (job.retrievedSources as any[])?.map(s => ({
    ...s,
    text: undefined // Remove the massive HTML-to-text dump
  })) ?? [];

  await db
    .update(bomJobs)
    .set({
      jobStage: "complete",
      resultStatus: normalizedStatus,
      brand: result.brand,
      model: result.model,
      serial: result.serial,
      productType: result.productType,
      rawRowCount: result.rawRowCount,
      uniqueRowCount: result.uniqueRowCount,
      coverageScore: result.coverageScore,
      issues: result.issues,
      unmatchedCallouts: result.unmatchedCallouts,
      finalRows: result.finalRows,
      retrievedSources: scrubbedSources,
      errorText: null,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function resetBomJobForRetry(jobId: string) {
  await db
    .update(bomJobs)
    .set({
      jobStage: "created",
      resultStatus: null,
      brand: null,
      model: null,
      serial: null,
      productType: null,
      coverageScore: 0,
      rawRowCount: 0,
      uniqueRowCount: 0,
      identity: null,
      diagramParse: null,
      retrievedSources: [],
      extractedRowsRaw: [],
      finalRows: [],
      unmatchedCallouts: [],
      issues: [],
      errorText: null,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function failBomJob(jobId: string, errorText: string) {
  await db
    .update(bomJobs)
    .set({
      jobStage: "failed",
      resultStatus: "failed",
      errorText,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function saveCompilationArtifacts(
  jobId: string,
  partial: {
    routingPlan?: any;
    agentLogs?: any[];
    jobPacket?: any;
  },
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  const existingIdentity = (job.identity as any) || {};
  const existingDiagramParse = (job.diagramParse as any) || {};

  await db
    .update(bomJobs)
    .set({
      identity: {
        ...existingIdentity,
        ...(partial.jobPacket ? { jobPacket: partial.jobPacket } : {}),
      },
      diagramParse: {
        ...existingDiagramParse,
        ...(partial.routingPlan ? { routingPlan: partial.routingPlan } : {}),
        ...(partial.agentLogs ? { agentLogs: partial.agentLogs } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));
}

export async function saveBomVisualTruth(
  jobId: string,
  visualTruth: Record<string, unknown>,
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  const diagramParse = (job.diagramParse as Record<string, unknown>) || {};
  const finalDiagramParse = {
    ...diagramParse,
    visualTruth,
  };
  
  await saveBomArtifacts(jobId, {
    diagramParse: finalDiagramParse,
  });

  // ✅ DISCOVERY FEEDBACK: Update the master appliance_models with the discovered sections
  if (job.model) {
    const normalized = normalizeCanonicalModel(job.model);
    await db
      .update(applianceModels)
      .set({
        diagramParse: finalDiagramParse,
        updatedAt: new Date(),
      })
      .where(eq(applianceModels.normalizedModel, normalized))
      .catch(err => console.error(`[JobStore] Failed to update master model ${normalized}:`, err));
  }
}

export async function getBomVisualTruth(jobId: string) {
  const job = await getBomJob(jobId);
  if (!job) return null;
  return ((job.diagramParse as Record<string, unknown> | null)?.visualTruth as
    | Record<string, unknown>
    | null
    | undefined) ?? null;
}

export async function saveBomSupplierRunInput(
  jobId: string,
  supplierId: string,
  input: Record<string, unknown>,
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  const diagramParse = (job.diagramParse as Record<string, unknown>) || {};
  const supplierRuns = (diagramParse.supplierRuns as Record<string, unknown>) || {};

  await saveBomArtifacts(jobId, {
    diagramParse: {
      ...diagramParse,
      supplierRuns: {
        ...supplierRuns,
        [supplierId]: {
          ...(supplierRuns[supplierId] as Record<string, unknown> | undefined),
          input,
        },
      },
    },
  });
}

export async function saveBomSupplierRunResult(
  jobId: string,
  supplierId: string,
  result: Record<string, unknown>,
) {
  const job = await getBomJob(jobId);
  if (!job) throw new Error("BOM job not found");

  const diagramParse = (job.diagramParse as Record<string, unknown>) || {};
  const supplierRuns = (diagramParse.supplierRuns as Record<string, unknown>) || {};

  await saveBomArtifacts(jobId, {
    diagramParse: {
      ...diagramParse,
      supplierRuns: {
        ...supplierRuns,
        [supplierId]: {
          ...(supplierRuns[supplierId] as Record<string, unknown> | undefined),
          result,
        },
      },
    },
  });
}

export async function getBomSupplierRun(
  jobId: string,
  supplierId: string,
) {
  const job = await getBomJob(jobId);
  if (!job) return null;

  const diagramParse = (job.diagramParse as Record<string, unknown> | null) || {};
  const supplierRuns = (diagramParse.supplierRuns as Record<string, unknown> | undefined) || {};
  return (supplierRuns[supplierId] as Record<string, unknown> | undefined) ?? null;
}

