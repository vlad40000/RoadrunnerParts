import "server-only";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/server/db";
import { bomJobs } from "@/src/server/db/schema/bom-jobs";
import { normalizeBomStatus } from "../core/bom-status";
import { uploadSourceEvidence } from "./blob-store";

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
    errorText?: string | null;
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
      errorText: partial.errorText ?? job.errorText,
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

