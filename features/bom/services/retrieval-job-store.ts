import "server-only";

import { desc, eq, sql as drizzleSql } from "drizzle-orm";

import { db } from "@/server/db";
import { sql } from "@/lib/db";
import { buildEncompassUrls, normalizeModelNumber } from "@/lib/encompass-routes";
import {
  bomAssemblies,
  captureArtifacts,
  modelRetrievalSummary,
  modelSourceUrls,
  partPricing,
  retrievalApplianceModels,
  retrievalBomParts,
  retrievalJobs,
} from "@/server/db/schema/retrieval-system";

export type EncompassRetrievalJobInput = {
  bomJobId?: string | null;
  jobId?: string | null;
  model?: string | null;
  modelNumber?: string | null;
  brand?: string | null;
  serialNumber?: string | null;
  sourceUrl?: string | null;
  canonUrl?: string | null;
  assemblyUrls?: string[];
  requestedBy?: string | null;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  priority?: number | null;
  jobType?: string | null;
};

export type EncompassRetrievalJob = EncompassRetrievalJobInput & {
  id: string;
  status: string;
  createdAt: string;
  canonicalModelId: string;
  sourceUrlId: string;
};

function normalizeInputModel(input: EncompassRetrievalJobInput) {
  const raw = input.model ?? input.modelNumber ?? "";
  return normalizeModelNumber(raw);
}

function inferUrlType(jobType: string) {
  if (jobType === "capture_exploded_view") return "exploded_view";
  if (jobType === "extract_pricing") return "pricing_page";
  if (jobType === "extract_parts") return "assembly_page";
  return "model_page";
}

function toPublicJob(row: any): EncompassRetrievalJob {
  return {
    id: row.id,
    bomJobId: row.bomJobId,
    jobId: row.bomJobId,
    model: row.modelNumber,
    modelNumber: row.modelNumber,
    brand: row.brand,
    sourceUrl: row.metadata?.sourceUrl ?? null,
    canonUrl: row.metadata?.sourceUrl ?? null,
    requestedBy: row.metadata?.requestedBy ?? null,
    metadata: row.metadata ?? {},
    payload: row.metadata ?? {},
    status: row.status,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    canonicalModelId: row.modelId,
    sourceUrlId: row.sourceUrlId,
  };
}

export async function enqueueEncompassRetrievalJob(
  input: EncompassRetrievalJobInput,
): Promise<EncompassRetrievalJob> {
  const normalizedModel = normalizeInputModel(input);
  if (!normalizedModel) {
    throw new Error("Model number is required before Encompass retrieval can be queued.");
  }

  const urls = buildEncompassUrls(normalizedModel);
  const jobType = input.jobType || "capture_model_page";
  const sourceUrl =
    input.sourceUrl ||
    input.canonUrl ||
    (jobType === "capture_exploded_view" ? urls.explodedViewUrl : urls.regularModelUrl);

  if (!sourceUrl) {
    throw new Error(urls.error || "Encompass source URL could not be resolved.");
  }

  const brand = input.brand ?? urls.brand ?? null;
  const metadata = {
    requestedBy: input.requestedBy ?? "api",
    sourceUrl,
    explodedViewUrl: urls.explodedViewUrl,
    assemblyUrls: input.assemblyUrls ?? [],
    ...(input.metadata ?? {}),
    ...(input.payload ?? {}),
  };

  const [modelRow] = await db
    .insert(retrievalApplianceModels)
    .values({
      normalizedModel,
      rawModel: input.model ?? input.modelNumber ?? normalizedModel,
      brand,
      serial: input.serialNumber ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: retrievalApplianceModels.normalizedModel,
      set: {
        rawModel: input.model ?? input.modelNumber ?? normalizedModel,
        brand,
        serial: input.serialNumber ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [sourceUrlRow] = await db
    .insert(modelSourceUrls)
    .values({
      modelId: modelRow.id,
      source: "encompass",
      urlType: inferUrlType(jobType),
      url: sourceUrl,
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
        httpStatus: null,
        lastCheckedAt: null,
      },
    })
    .returning();

  const [jobRow] = await db
    .insert(retrievalJobs)
    .values({
      bomJobId: input.bomJobId ?? input.jobId ?? null,
      modelId: modelRow.id,
      sourceUrlId: sourceUrlRow.id,
      modelNumber: normalizedModel,
      brand,
      source: "encompass",
      jobType,
      status: "queued",
      priority: input.priority ?? 100,
      metadata,
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

  return toPublicJob(jobRow);
}

export async function listEncompassRetrievalJobs(): Promise<EncompassRetrievalJob[]> {
  const rows = await db
    .select()
    .from(retrievalJobs)
    .orderBy(desc(retrievalJobs.createdAt))
    .limit(100);

  return rows.map(toPublicJob);
}

export async function claimNextEncompassRetrievalJob(workerId: string) {
  const rows = await sql`
    WITH next_job AS (
      SELECT id
      FROM retrieval_jobs
      WHERE status IN ('queued', 'retry')
        AND attempt_count < max_attempts
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE retrieval_jobs
    SET status = 'running',
        locked_by = ${workerId},
        locked_at = now(),
        started_at = COALESCE(started_at, now()),
        attempt_count = attempt_count + 1,
        updated_at = now()
    WHERE id IN (SELECT id FROM next_job)
    RETURNING *;
  `;

  return rows[0] ?? null;
}

export async function recordCaptureArtifact(input: {
  retrievalJobId?: string | null;
  normalizedModel: string;
  sourceUrl: string;
  artifactType: string;
  storagePath?: string | null;
  httpStatus?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const normalizedModel = normalizeModelNumber(input.normalizedModel);
  if (!normalizedModel) {
    throw new Error("normalizedModel is required to persist capture artifacts.");
  }

  let jobRow: any = null;
  if (input.retrievalJobId) {
    const rows = await db
      .select()
      .from(retrievalJobs)
      .where(eq(retrievalJobs.id, input.retrievalJobId))
      .limit(1);
    jobRow = rows[0] ?? null;
  }

  const [modelRow] = await db
    .insert(retrievalApplianceModels)
    .values({
      normalizedModel,
      rawModel: normalizedModel,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: retrievalApplianceModels.normalizedModel,
      set: { updatedAt: new Date() },
    })
    .returning();

  await db
    .insert(modelSourceUrls)
    .values({
      modelId: modelRow.id,
      source: "encompass",
      urlType: "model_page",
      url: input.sourceUrl,
      status: "captured",
      httpStatus: input.httpStatus ?? null,
      lastCheckedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        modelSourceUrls.modelId,
        modelSourceUrls.source,
        modelSourceUrls.urlType,
        modelSourceUrls.url,
      ],
      set: {
        status: "captured",
        httpStatus: input.httpStatus ?? null,
        lastCheckedAt: new Date(),
      },
    });

  const [artifact] = await db
    .insert(captureArtifacts)
    .values({
      modelId: modelRow.id,
      jobId: jobRow?.id ?? null,
      source: "encompass",
      url: input.sourceUrl,
      artifactType: input.artifactType,
      storagePath: input.storagePath ?? null,
      httpStatus: input.httpStatus ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (jobRow) {
    await db
      .update(retrievalJobs)
      .set({
        resultSummary: {
          ...(jobRow.resultSummary ?? {}),
          artifacts: [
            ...(((jobRow.resultSummary as any)?.artifacts as any[]) ?? []),
            {
              artifactId: artifact.id,
              artifactType: input.artifactType,
              storagePath: input.storagePath ?? null,
              sourceUrl: input.sourceUrl,
              capturedAt: new Date().toISOString(),
            },
          ],
        },
        updatedAt: new Date(),
      })
      .where(eq(retrievalJobs.id, jobRow.id));
  }

  return artifact;
}

type ExtractedPartRow = {
  sectionName?: string | null;
  partNumber: string;
  description: string;
  diagramRef?: string | null;
  quantity?: number | null;
  confidence?: number | string | null;
  sourceUrl?: string | null;
};

type ExtractedPricingRow = {
  partNumber: string;
  price: string | number | null;
  availability?: string | null;
  priceUrl?: string | null;
};

async function getJobOrThrow(retrievalJobId: string) {
  const rows = await db
    .select()
    .from(retrievalJobs)
    .where(eq(retrievalJobs.id, retrievalJobId))
    .limit(1);
  const job = rows[0];
  if (!job) throw new Error(`Retrieval job not found: ${retrievalJobId}`);
  if (!job.modelId) throw new Error(`Retrieval job ${retrievalJobId} is missing modelId`);
  return job;
}

function normalizePartNumber(partNumber: string) {
  return String(partNumber || "").trim().toUpperCase();
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function completeExtractPartsJob(input: {
  retrievalJobId: string;
  rows: ExtractedPartRow[];
  source?: string;
}) {
  const job = await getJobOrThrow(input.retrievalJobId);
  const source = input.source ?? "encompass";
  const sourceUrl = (job.metadata as any)?.sourceUrl ?? null;

  const assembliesByName = new Map<string, string>();
  for (const row of input.rows) {
    const assemblyName = String(row.sectionName || "General").trim() || "General";
    if (assembliesByName.has(assemblyName)) continue;
    const [assembly] = await db
      .insert(bomAssemblies)
      .values({
        modelId: job.modelId,
        source,
        assemblyName,
        assemblyUrl: sourceUrl,
      })
      .onConflictDoUpdate({
        target: [bomAssemblies.modelId, bomAssemblies.source, bomAssemblies.assemblyName],
        set: { assemblyUrl: sourceUrl },
      })
      .returning();
    assembliesByName.set(assemblyName, assembly.id);
  }

  for (const row of input.rows) {
    const partNumber = normalizePartNumber(row.partNumber);
    if (!partNumber) continue;
    const assemblyName = String(row.sectionName || "General").trim() || "General";
    const assemblyId = assembliesByName.get(assemblyName) ?? null;
    const qty = row.quantity == null ? null : Number(row.quantity);

    await db
      .insert(retrievalBomParts)
      .values({
        modelId: job.modelId,
        assemblyId,
        source,
        partNumber,
        description: row.description,
        diagramRef: row.diagramRef ?? null,
        quantity: Number.isFinite(qty as number) ? (qty as number) : null,
        sourceUrl: row.sourceUrl ?? sourceUrl,
        confidence:
          row.confidence == null ? "1" : String(row.confidence),
      })
      .onConflictDoUpdate({
        target: [
          retrievalBomParts.modelId,
          retrievalBomParts.source,
          retrievalBomParts.partNumber,
          retrievalBomParts.assemblyId,
        ],
        set: {
          description: row.description,
          diagramRef: row.diagramRef ?? null,
          quantity: Number.isFinite(qty as number) ? (qty as number) : null,
          sourceUrl: row.sourceUrl ?? sourceUrl,
          confidence: row.confidence == null ? "1" : String(row.confidence),
          updatedAt: new Date(),
        },
      });
  }

  const [{ count: partCount }] = await db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(retrievalBomParts)
    .where(eq(retrievalBomParts.modelId, job.modelId));

  const partCountNumber = Number(partCount || 0);
  await db
    .insert(modelRetrievalSummary)
    .values({
      modelId: job.modelId,
      retrievalState: partCountNumber > 0 ? "parts_partial" : "failed",
      actualPartCount: partCountNumber,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: modelRetrievalSummary.modelId,
      set: {
        retrievalState: partCountNumber > 0 ? "parts_partial" : "failed",
        actualPartCount: partCountNumber,
        updatedAt: new Date(),
      },
    });

  await db
    .update(retrievalJobs)
    .set({
      status: "completed",
      finishedAt: new Date(),
      resultSummary: {
        ...asObjectRecord(job.resultSummary),
        partsInserted: input.rows.length,
        actualPartCount: partCountNumber,
      },
      updatedAt: new Date(),
    })
    .where(eq(retrievalJobs.id, job.id));

  return { actualPartCount: partCountNumber, partsInserted: input.rows.length };
}

export async function completeExtractPricingJob(input: {
  retrievalJobId: string;
  rows: ExtractedPricingRow[];
  source?: string;
}) {
  const job = await getJobOrThrow(input.retrievalJobId);
  const source = input.source ?? "encompass";
  const defaultPriceUrl = (job.metadata as any)?.sourceUrl ?? null;

  for (const row of input.rows) {
    const partNumber = normalizePartNumber(row.partNumber);
    if (!partNumber) continue;

    const [part] = await db
      .select()
      .from(retrievalBomParts)
      .where(
        drizzleSql`${retrievalBomParts.modelId} = ${job.modelId} AND ${retrievalBomParts.partNumber} = ${partNumber}`,
      )
      .limit(1);
    if (!part) continue;

    const numericPrice =
      row.price == null || String(row.price).trim() === ""
        ? null
        : String(row.price).replace(/[^0-9.]/g, "");

    await db
      .insert(partPricing)
      .values({
        modelId: job.modelId,
        partId: part.id,
        source,
        partNumber,
        price: numericPrice && Number(numericPrice) > 0 ? numericPrice : null,
        availability: row.availability ?? null,
        priceUrl: row.priceUrl ?? defaultPriceUrl,
      })
      .onConflictDoUpdate({
        target: [partPricing.modelId, partPricing.source, partPricing.partNumber],
        set: {
          partId: part.id,
          price: numericPrice && Number(numericPrice) > 0 ? numericPrice : null,
          availability: row.availability ?? null,
          priceUrl: row.priceUrl ?? defaultPriceUrl,
          capturedAt: new Date(),
        },
      });
  }

  const [{ count: actualPartCount }] = await db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(retrievalBomParts)
    .where(eq(retrievalBomParts.modelId, job.modelId));
  const [{ count: pricedPartCount }] = await db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(partPricing)
    .where(
      drizzleSql`${partPricing.modelId} = ${job.modelId} AND ${partPricing.price} IS NOT NULL`,
    );

  const actual = Number(actualPartCount || 0);
  const priced = Number(pricedPartCount || 0);
  const retrievalState =
    actual > 0 && priced >= actual ? "bom_complete" : priced > 0 ? "pricing_partial" : "parts_partial";

  await db
    .insert(modelRetrievalSummary)
    .values({
      modelId: job.modelId,
      retrievalState,
      actualPartCount: actual,
      pricedPartCount: priced,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: modelRetrievalSummary.modelId,
      set: {
        retrievalState,
        actualPartCount: actual,
        pricedPartCount: priced,
        updatedAt: new Date(),
      },
    });

  await db
    .update(retrievalJobs)
    .set({
      status: "completed",
      finishedAt: new Date(),
      resultSummary: {
        ...asObjectRecord(job.resultSummary),
        pricesProcessed: input.rows.length,
        actualPartCount: actual,
        pricedPartCount: priced,
        retrievalState,
      },
      updatedAt: new Date(),
    })
    .where(eq(retrievalJobs.id, job.id));

  return { actualPartCount: actual, pricedPartCount: priced, retrievalState };
}
