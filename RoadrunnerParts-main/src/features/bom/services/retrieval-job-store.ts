// import "server-only";
import crypto from "crypto";
import { desc, eq, and, or, inArray } from "drizzle-orm";
import { db } from "@/src/server/db";
import { sql } from "@/src/lib/db";
import { buildEncompassUrls } from "@/src/lib/encompass-routes";
import { applianceModels } from "@/src/server/db/schema/appliance-models";
import { bomRetrievalJobs } from "@/src/server/db/schema/bom-retrieval-jobs";
import { modelSources } from "@/src/server/db/schema/model-sources";
import { providerModelRoutes } from "@/src/server/db/schema/provider-seeds";
import {
  applianceModels as retrievalApplianceModels,
  modelRetrievalSummary,
  modelSourceUrls,
  retrievalJobs,
} from "@/src/server/db/schema/retrieval-system";
import { getBomJob, updateBomJobSummary } from "./job-store";
import { normalizeCanonicalModel } from "./source-tier-policy";

export type EncompassRetrievalJobType =
  | "capture_model_page"
  | "capture_exploded_view"
  | "extract_parts"
  | "extract_pricing"
  | "encompass_bom_pricing";

async function upsertRetrievalJob(input: {
  bomJobId: string;
  provider?: string;
  jobType: EncompassRetrievalJobType;
  model: string;
  brand?: string | null;
  sourceUrl?: string | null;
  priority?: number | null;
  payload?: Record<string, unknown>;
}) {
  const id = crypto.randomUUID();
  const values = {
    id,
    bomJobId: input.bomJobId,
    provider: input.provider ?? "encompass",
    jobType: input.jobType,
    status: "pending",
    priority: input.priority ?? 100,
    model: input.model,
    brand: input.brand ?? null,
    sourceUrl: input.sourceUrl ?? null,
    payload: input.payload ?? {},
    updatedAt: new Date(),
  };

  await db
    .insert(bomRetrievalJobs)
    .values(values)
    .onConflictDoUpdate({
      target: [
        bomRetrievalJobs.bomJobId,
        bomRetrievalJobs.provider,
        bomRetrievalJobs.jobType,
        bomRetrievalJobs.model,
      ],
      set: {
        status: "pending",
        priority: values.priority,
        brand: values.brand,
        sourceUrl: values.sourceUrl,
        payload: values.payload,
        errorText: null,
        lockedBy: null,
        lockedAt: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      },
    });

  const [job] = await db
    .select()
    .from(bomRetrievalJobs)
    .where(
      and(
        eq(bomRetrievalJobs.bomJobId, input.bomJobId),
        eq(bomRetrievalJobs.provider, values.provider),
        eq(bomRetrievalJobs.jobType, input.jobType),
        eq(bomRetrievalJobs.model, input.model),
      ),
    )
    .orderBy(desc(bomRetrievalJobs.createdAt))
    .limit(1);

  return job ?? null;
}

async function createCanonicalRetrievalJob(input: {
  bomJobId: string;
  model: string;
  rawModel?: string | null;
  brand?: string | null;
  brandCode?: string | null;
  sourceUrl: string;
  urlType: string;
  jobType: EncompassRetrievalJobType;
  priority?: number | null;
  payload?: Record<string, unknown>;
}) {
  const [modelRow] = await db
    .insert(retrievalApplianceModels)
    .values({
      normalizedModel: input.model,
      rawModel: input.rawModel ?? input.model,
      brand: input.brand ?? null,
      brandCode: input.brandCode ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: retrievalApplianceModels.normalizedModel,
      set: {
        rawModel: input.rawModel ?? input.model,
        brand: input.brand ?? null,
        brandCode: input.brandCode ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [sourceUrlRow] = await db
    .insert(modelSourceUrls)
    .values({
      modelId: modelRow.id,
      source: "encompass",
      urlType: input.urlType,
      url: input.sourceUrl,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [
        modelSourceUrls.modelId,
        modelSourceUrls.source,
        modelSourceUrls.urlType,
        modelSourceUrls.url,
      ],
      set: {
        status: "pending",
        lastCheckedAt: null,
      },
    })
    .returning();

  const [jobRow] = await db
    .insert(retrievalJobs)
    .values({
      bomJobId: input.bomJobId,
      modelId: modelRow.id,
      sourceUrlId: sourceUrlRow.id,
      modelNumber: input.model,
      brand: input.brand ?? null,
      source: "encompass",
      jobType: input.jobType,
      status: "queued",
      priority: input.priority ?? 100,
      metadata: input.payload ?? {},
      updatedAt: new Date(),
    })
    .returning();

  await db
    .insert(modelRetrievalSummary)
    .values({
      modelId: modelRow.id,
      retrievalState: "queued",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: modelRetrievalSummary.modelId,
      set: {
        retrievalState: "queued",
        error: null,
        updatedAt: new Date(),
      },
    });

  return { modelRow, sourceUrlRow, jobRow };
}

export async function createEncompassModelPageJob(input: {
  bomJobId: string;
  model?: string | null;
  brand?: string | null;
  priority?: number | null;
  payload?: Record<string, unknown>;
}) {
  const bomJob = await getBomJob(input.bomJobId);
  if (!bomJob) throw new Error("BOM job not found");

  const model = normalizeCanonicalModel(input.model || bomJob.model);
  if (!model) {
    throw new Error("Persisted model is required before Encompass retrieval.");
  }

  const route = buildEncompassUrls(model);
  if (route.error || !route.regularModelUrl) {
    throw new Error(route.error || "Encompass brand route could not be resolved.");
  }

  const brand = input.brand ?? bomJob.brand ?? route.brand ?? null;
  const resolvedBrand = brand ?? route.brand ?? null;

  await db
    .insert(applianceModels)
    .values({
      normalizedModel: model,
      brand: resolvedBrand,
      brandFamily: route.brand ?? resolvedBrand,
      retrievalState: "model_url_built",
      bomComplete: false,
      partsComplete: false,
      pricingComplete: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: applianceModels.normalizedModel,
      set: {
        brand: resolvedBrand,
        brandFamily: route.brand ?? resolvedBrand,
        retrievalState: "model_url_built",
        bomComplete: false,
        partsComplete: false,
        pricingComplete: false,
        updatedAt: new Date(),
      },
    });

  await db.insert(modelSources).values({
    normalizedModel: model,
    source: "encompass",
    tier: "distributor",
    sourceUrl: route.regularModelUrl,
    urlType: "model_page",
    confidence: "route_resolved",
    status: "queued",
    raw: {
      jobType: "capture_model_page",
      brandCode: route.brandCode,
      regularModelUrl: route.regularModelUrl,
      explodedViewUrl: route.explodedViewUrl,
    },
  });

  const canonical = await createCanonicalRetrievalJob({
    bomJobId: input.bomJobId,
    model,
    rawModel: input.model || bomJob.model,
    brand: resolvedBrand,
    brandCode: route.brandCode,
    sourceUrl: route.regularModelUrl,
    urlType: "model_page",
    jobType: "capture_model_page",
    priority: input.priority ?? 80,
    payload: {
      requestedBy: "api",
      sourcePolicy: "db_first_worker",
      compatibilityBomRetrievalJobs: true,
      brandCode: route.brandCode,
      regularModelUrl: route.regularModelUrl,
      explodedViewUrl: route.explodedViewUrl,
      ...(input.payload ?? {}),
    },
  });

  await db
    .insert(providerModelRoutes)
    .values({
      brand: resolvedBrand,
      brandCode: route.brandCode,
      model,
      provider: "encompass",
      providerModelUrl: route.regularModelUrl,
      sourceStatus: "queued",
      sourceFile: "retrieval-job-store",
    })
    .onConflictDoNothing();

  const retrievalJob = await upsertRetrievalJob({
    bomJobId: input.bomJobId,
    jobType: "capture_model_page",
    model,
    brand: resolvedBrand,
    sourceUrl: route.regularModelUrl,
    priority: input.priority ?? 80,
    payload: {
      requestedBy: "api",
      sourcePolicy: "db_first_worker",
      canonicalRetrievalJobId: canonical.jobRow.id,
      canonicalModelId: canonical.modelRow.id,
      canonicalSourceUrlId: canonical.sourceUrlRow.id,
      brandCode: route.brandCode,
      explodedViewUrl: route.explodedViewUrl,
      ...(input.payload ?? {}),
    },
  });

  await updateBomJobSummary(input.bomJobId, {
    jobStage: "capture_model_page_queued",
    retrievalState: "model_url_built",
    sourceStrategy: "db-first-worker:encompass",
    model,
    brand: resolvedBrand,
  });

  return retrievalJob;
}

export async function enqueueEncompassRetrievalJob(input: {
  bomJobId: string;
  model?: string | null;
  brand?: string | null;
  sourceUrl?: string | null;
  priority?: number | null;
  payload?: Record<string, unknown>;
}) {
  const bomJob = await getBomJob(input.bomJobId);
  if (!bomJob) throw new Error("BOM job not found");

  const model = normalizeCanonicalModel(input.model || bomJob.model);
  if (!model) {
    throw new Error("Persisted model is required before Encompass retrieval.");
  }

  let canonicalPayload = input.payload ?? {};
  if (input.sourceUrl) {
    const canonical = await createCanonicalRetrievalJob({
      bomJobId: input.bomJobId,
      model,
      rawModel: input.model || bomJob.model,
      brand: input.brand ?? bomJob.brand ?? null,
      brandCode:
        typeof input.payload?.brandCode === "string"
          ? input.payload.brandCode
          : null,
      sourceUrl: input.sourceUrl,
      urlType: "model_page",
      jobType: "encompass_bom_pricing",
      priority: input.priority ?? 100,
      payload: {
        requestedBy: "api",
        sourcePolicy: "db_first_worker",
        compatibilityBomRetrievalJobs: true,
        ...(input.payload ?? {}),
      },
    });
    canonicalPayload = {
      ...canonicalPayload,
      canonicalRetrievalJobId: canonical.jobRow.id,
      canonicalModelId: canonical.modelRow.id,
      canonicalSourceUrlId: canonical.sourceUrlRow.id,
    };
  }

  const job = await upsertRetrievalJob({
    bomJobId: input.bomJobId,
    jobType: "encompass_bom_pricing",
    model,
    brand: input.brand ?? bomJob.brand ?? null,
    sourceUrl: input.sourceUrl ?? null,
    priority: input.priority ?? 100,
    payload: canonicalPayload,
  });

  await updateBomJobSummary(input.bomJobId, {
    jobStage: "encompass_retrieval_queued",
    retrievalState: bomJob.retrievalState ?? "sources_resolved",
    sourceStrategy: "db-first-worker:encompass",
    model,
    brand: input.brand ?? bomJob.brand ?? null,
  });

  return job;
}

export async function listRetrievalJobsForBomJob(bomJobId: string) {
  return db
    .select()
    .from(bomRetrievalJobs)
    .where(eq(bomRetrievalJobs.bomJobId, bomJobId))
    .orderBy(desc(bomRetrievalJobs.createdAt));
}

/**
 * Claims the next available job for a worker.
 * Uses FOR UPDATE SKIP LOCKED to prevent race conditions.
 */
export async function claimNextRetrievalJob(workerId: string) {
  const result = await sql`
    WITH next_job AS (
      SELECT id
      FROM bom_retrieval_jobs
      WHERE status = 'pending'
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE bom_retrieval_jobs
    SET
      status = 'running',
      locked_at = now(),
      started_at = now(),
      locked_by = ${workerId},
      attempts = attempts + 1,
      updated_at = now()
    WHERE id IN (SELECT id FROM next_job)
    RETURNING *;
  `;

  return (result[0] as any) || null;
}

export async function updateRetrievalJobStatus(
  jobId: string,
  status: "completed" | "failed",
  updates: {
    resultSummary?: Record<string, unknown>;
    errorText?: string | null;
  }
) {
  await db
    .update(bomRetrievalJobs)
    .set({
      status,
      finishedAt: new Date(),
      resultSummary: updates.resultSummary ?? {},
      errorText: updates.errorText ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bomRetrievalJobs.id, jobId));
}
