import { buildOptimizedResponse } from "@/lib/parts-graph";
import { canonicalizeDiagramGroup, sortDiagramGroups } from "@/lib/diagram-grouping";
import { normalizeModelNumber } from "@/lib/normalize";
import { reconcileParts } from "@/lib/parts-reconcile";
import { classifyBomResult } from "./bom-status";
import { searsPartsDirectProvider } from "../services/providers/sears-partsdirect";
import { encompassFamilyProvider } from "../services/providers/encompass-family";
import { partsDrProvider } from "../services/providers/partsdr";
import { fixComProvider } from "../services/providers/fix-com";
import { partSelectProvider } from "../services/providers/partselect";
import { fetchHtml } from "../services/providers/utils";
import { load } from "cheerio";
import {
  completeBomJob,
  getBomJob,
  saveBomArtifacts,
  setBomJobStage,
  updateBomJobSummary,
} from "../services/job-store";
import {
  completeBomJobGroup,
  failBomJobGroup,
  getBomJobGroup,
  listBomJobGroups,
  markBomJobGroupRunning,
  replaceBomJobGroups,
} from "../services/job-group-store";
import { runWithConcurrency } from "@/lib/concurrency-util";
import { extractPartsFromHtmlPage } from "@/lib/gemini";

const BATCH_SIZE = 40;

function getNextBatch<T>(input: {
  acceptedRows: T[];
  alreadyDeliveredCount: number;
  trustedTotalPartCount: number | null;
  timedOut?: boolean;
}) {
  const acceptedSinceLastFlush =
    input.acceptedRows.length - input.alreadyDeliveredCount;

  const remainingByTotal =
    input.trustedTotalPartCount == null
      ? null
      : Math.max(0, input.trustedTotalPartCount - input.alreadyDeliveredCount);

  const batchLimit = input.timedOut
    ? acceptedSinceLastFlush
    : remainingByTotal == null
      ? Math.min(BATCH_SIZE, acceptedSinceLastFlush)
      : Math.min(BATCH_SIZE, remainingByTotal, acceptedSinceLastFlush);

  const deliveredTotal = input.alreadyDeliveredCount + batchLimit;

  return {
    rows: input.acceptedRows.slice(input.alreadyDeliveredCount, deliveredTotal),
    deliveredThisBatch: batchLimit,
    deliveredTotal,
    remainingCount:
      input.trustedTotalPartCount == null
        ? null
        : Math.max(0, input.trustedTotalPartCount - deliveredTotal),
    hasMore:
      input.trustedTotalPartCount == null
        ? batchLimit === BATCH_SIZE
        : deliveredTotal < input.trustedTotalPartCount,
  };
}

function cleanText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toRetrievedSource(group: { sourceUrl: string; groupName: string }) {
  return {
    sourceUrl: group.sourceUrl,
    sourceType: "diagram",
    sectionName: group.groupName,
    text: group.groupName,
  };
}

function mergeRetrievedSources(existing: any[] = [], nextSource: any) {
  if (existing.some((item) => item?.sourceUrl === nextSource.sourceUrl)) {
    return existing;
  }
  return [...existing, nextSource];
}

function sourceDomainForGroup(source: string | null | undefined) {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized.includes("fix")) return "fix.com";
  if (normalized.includes("sears")) return "searspartsdirect.com";
  if (normalized.includes("partselect")) return "partselect.com";
  return normalized || "unknown";
}

function toRawReconcileRows(group: { groupName: string; sourceUrl: string; source?: string }, rows: any[] = []) {
  return rows.map((row) => ({
    source: sourceDomainForGroup(row.source || group.source),
    raw_part_number: String(row.part_number || row.partNumber || "").trim().toUpperCase(),
    raw_part_name: String(row.description || row.name || "").trim(),
    raw_category: group.groupName,
    section_name: group.groupName,
    quantity: row.qty || row.quantity || null,
    diagram_ref: row.diagram_ref || row.diagramRef || null,
    raw_payload: {
      ...row,
      source_url: group.sourceUrl,
      diagram_group: group.groupName,
    },
  })).filter((row) => row.raw_part_number && row.raw_part_name);
}

function toUiParts(parts: any[] = []) {
  return parts.map((part) => ({
    section:
      part?.section ||
      part?.category ||
      part?.normalizedCategory ||
      part?.normalizedSection ||
      "Uncategorized",
    diagramNumber:
      part?.diagramNumber ??
      part?.diagram_number ??
      part?.itemNumber ??
      part?.item_number ??
      "",
    originalPartNumber:
      part?.originalPartNumber ||
      part?.original_part_number ||
      part?.partNumber ||
      part?.part_number ||
      null,
    currentServicePartNumber:
      part?.currentServicePartNumber ||
      part?.current_service_part_number ||
      part?.partNumber ||
      part?.part_number ||
      null,
    description:
      part?.description ||
      part?.name ||
      part?.partDescription ||
      part?.part_description ||
      "Appliance Part",
    nlaStatus:
      Boolean(part?.nlaStatus) ||
      Boolean(part?.isNla) ||
      Boolean(part?.discontinued) ||
      false,
    sourceUrl: part?.sourceUrl || part?.url || part?.source_url || "",
    sourceType: part?.sourceType || part?.source_type || "diagram",
    imageUrl: part?.imageUrl || part?.image_url || null,
    replacementNote: part?.replacementNote || part?.replacement_note || null,
    confidence: typeof part?.confidence === "number" ? part.confidence : 0.95,
    retailPrice: part?.retailPrice ?? null,
    retailPriceText: part?.retailPriceText ?? null,
    retailAvailability: part?.retailAvailability ?? null,
    retailPricingUrl: part?.retailPricingUrl ?? null,
    retailPriceSource: part?.retailPriceSource ?? null,
    retailPriceVerified: part?.retailPriceVerified ?? false,
    retailPricedAt: part?.retailPricedAt ?? null,
  }));
}

function getIdentityConfidence(job: any) {
  const identity = (job?.identity ?? {}) as Record<string, unknown>;
  const raw = identity.identityConfidence ?? identity.confidence;
  return typeof raw === "number" ? raw : 1;
}

function parseStructuredGroupRows(text: string | null | undefined, sourceName: string = "sears") {
  if (!text) return [];

  const rows: Array<{
    part_number: string;
    description: string;
    diagram_ref: string | null;
    qty: number;
    source: string;
    source_url: string;
    is_substitute: boolean;
    replacement_note: string | null;
    nla_status: boolean;
    image_url?: string | null;
    evidence?: string | null;
  }> = [];

  const lines = String(text)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith("ROW|")) continue;

    const fields = line.split("|").slice(1);
    const record: Record<string, string> = {};

    for (const field of fields) {
      const pivot = field.indexOf("=");
      if (pivot <= 0) continue;
      const key = field.slice(0, pivot).trim();
      const value = field.slice(pivot + 1).trim();
      record[key] = value;
    }

    const currentPart = String(record.current_service_part_number || record.original_part_number || "").trim().toUpperCase();
    const originalPart = String(record.original_part_number || "").trim().toUpperCase();
    const partNumber = currentPart || originalPart;
    const description = String(record.description || "Appliance Part").trim();

    if (!partNumber || !description) continue;

    rows.push({
      part_number: partNumber,
      description,
      diagram_ref: record.diagram_number ? String(record.diagram_number).trim() : null,
      qty: 1,
      source: sourceName,
      source_url: "",
      is_substitute: currentPart && originalPart && currentPart !== originalPart,
      replacement_note: record.replacement_note ? String(record.replacement_note).trim() : null,
      nla_status: /^true$/i.test(String(record.nla_status || "false")),
      image_url: record.image_url || null,
      evidence: record.evidence || null,
    });
  }

  return rows;
}

export async function discoverDiagramGroupsForJob(input: {
  jobId: string;
  identity: {
    brand?: string;
    model: string;
    serial?: string;
    productType?: string;
    confidence?: number;
    searchConfidence?: number;
    familyKey?: string;
    resolvedBrand?: string;
  };
}) {
  const job = await getBomJob(input.jobId);
  if (!job) throw new Error("BOM job not found");

  const model = String(input.identity.model || "").trim();
  if (!model) throw new Error("A reviewed model is required before diagram discovery.");

  await updateBomJobSummary(input.jobId, {
    jobStage: "discovering_diagram_groups",
    brand: input.identity.brand ?? job.brand,
    model,
    serial: input.identity.serial ?? job.serial,
    productType: input.identity.productType ?? job.productType,
    resultStatus: job.resultStatus ?? "not_checked",
  });

  await saveBomArtifacts(input.jobId, {
    identity: {
      ...(job.identity ?? {}),
      brand: input.identity.brand ?? job.brand ?? null,
      displayBrand: input.identity.brand ?? job.brand ?? null,
      resolvedBrand: input.identity.resolvedBrand ?? input.identity.brand ?? job.brand ?? null,
      model,
      serial: input.identity.serial ?? job.serial ?? null,
      productType: input.identity.productType ?? job.productType ?? null,
      confidence: input.identity.confidence ?? getIdentityConfidence(job),
      identityConfidence: input.identity.confidence ?? getIdentityConfidence(job),
      searchConfidence: input.identity.searchConfidence ?? 0,
      familyKey: input.identity.familyKey ?? null,
    },
  });

  let providerSources: any[] = [];
  let usedProvider = "encompass+sears+partsdr";

  const providerInput = {
    model,
    brand: input.identity.brand ?? job.brand ?? null,
    productType: input.identity.productType ?? job.productType ?? null,
  } as any;

  const [encompassSources, searsSources, partsDrSources] = await Promise.all([
    encompassFamilyProvider.fetchSources(providerInput).catch(() => []),
    searsPartsDirectProvider.fetchSources(providerInput).catch(() => []),
    partsDrProvider.fetchSources(providerInput).catch(() => []),
  ]);

  providerSources = [...encompassSources, ...searsSources, ...partsDrSources];

  // Fallback to Secondary Distributors
  if (!providerSources.length) {
    usedProvider = "app+partselect+fix+repairclinic";
    const [appSources, psSources, fixSources, rcSources] = await Promise.all([
      import("../services/providers/appliancepartspros").then(m => m.appliancePartsProsProvider.fetchSources(providerInput)).catch(() => []),
      partSelectProvider.fetchSources(providerInput).catch(() => []),
      fixComProvider.fetchSources(providerInput).catch(() => []),
      import("../services/providers/repairclinic-family").then(m => m.repairClinicFamilyProvider.fetchSources(providerInput)).catch(() => []),
    ]);
    providerSources = [...appSources, ...psSources, ...fixSources, ...rcSources];
  }

  if (!providerSources.length) {
    await setBomJobStage(input.jobId, "identity_review");
    throw new Error(`BOM Discovery Failed: No exact model matches or diagram catalogs found for "${model}" on authoritative sources (Encompass / Sears / PartsDr).`);
  }

  // Capture coverage target from metadata if available
  const meta = providerSources[0]?.meta || {};
  if (meta.expectedPartsTotal) {
    await updateBomJobSummary(input.jobId, {
      expectedPartsTotal: meta.expectedPartsTotal,
      expectedPartsSource: meta.expectedPartsSource || usedProvider,
      truthSource: usedProvider,
      sourceStrategy: "diagram-group-sequenced",
    } as any);
  } else {
    await updateBomJobSummary(input.jobId, {
      truthSource: usedProvider,
      sourceStrategy: "diagram-group-sequenced",
    } as any);
  }

  const groups = sortDiagramGroups(
    providerSources.map((source: any) => {
      const sectionName = String(source.sectionName || "All Model Parts").trim() || "All Model Parts";
      const canonical = canonicalizeDiagramGroup(sectionName);
      return {
        source: usedProvider,
        sourceUrl: String(source.sourceUrl || "").trim(),
        sourceText: String(source.text || ""),
        groupKey: canonical.groupKey,
        groupName: canonical.groupName,
        groupOrder: canonical.groupOrder,
      };
    }),
  );

  const inserted = await replaceBomJobGroups(input.jobId, groups);
  await setBomJobStage(input.jobId, "group_ready");

  return {
    job: await getBomJob(input.jobId),
    groups: inserted,
    activeGroupId: inserted.find((group) => group.status === "pending")?.id ?? null,
  };
}

export async function extractDiagramGroupForJob(input: {
  jobId: string;
  groupId: string;
}) {
  const job = await getBomJob(input.jobId);
  if (!job) throw new Error("BOM job not found");

  const group = await getBomJobGroup(input.jobId, input.groupId);
  if (!group) throw new Error("BOM diagram group not found");

  if (!job.model && !(job.identity as any)?.model) {
    throw new Error("The BOM job is missing a reviewed model.");
  }

  await setBomJobStage(input.jobId, "extracting_group");
  await markBomJobGroupRunning(input.jobId, input.groupId);

  try {
    let sourceText = group.sourceText;
    if (!sourceText || sourceText.includes("(Diagram groups are typically extracted sequentially)")) {
      const html = await fetchHtml(group.sourceUrl);
      if (group.source === "fix.com") {
        const { parseFixRowsToText } = await import("../services/providers/fix-com");
        sourceText = `SOURCE_PROVIDER: fix.com\nMODEL: ${job.model}\nSECTION: ${group.groupName}\n` + 
          parseFixRowsToText(html, group.sourceUrl);
      } else {
        sourceText = `SOURCE_PROVIDER: ${group.source}\nMODEL: ${job.model}\nSECTION: ${group.groupName}\nRAW_CONTENT:\n${html}`;
      }
    }

    const diagramRows = parseStructuredGroupRows(sourceText, group.source).map((row) => ({
      ...row,
      source_url: group.sourceUrl,
      diagram_group: group.groupName,
    }));

    const newRawRows = toRawReconcileRows(group, diagramRows);
    const existingRawRows = Array.isArray(job.extractedRowsRaw) ? job.extractedRowsRaw : [];
    const mergedRawRows = [...existingRawRows, ...newRawRows];

    const reconcileResult = await reconcileParts(
      normalizeModelNumber(String(job.model || (job.identity as any)?.model || "")),
      mergedRawRows as any,
      { persist: false, expectedTotal: job.expectedPartsTotal },
    );

    const optimized = buildOptimizedResponse(
      normalizeModelNumber(String(job.model || (job.identity as any)?.model || "")),
      reconcileResult.masterParts,
      {
        summary: `Grouped BOM for ${job.model || (job.identity as any)?.model || ""}`,
        brand: job.brand,
        completenessScore: reconcileResult.completenessScore,
        rawRowCount: mergedRawRows.length,
        sectionCount: reconcileResult.sectionCount,
        truthSource: job.truthSource || group.source || "diagram-groups",
        sourceStrategy: "diagram-group-sequenced",
        conflictFlags: [],
      },
    );

    const finalRows = toUiParts(optimized.parts || []);
    const sections = new Set(finalRows.map((row) => row.section).filter(Boolean));
    const status = classifyBomResult({
      identityConfidence: getIdentityConfidence(job),
      rows: finalRows as any,
      sectionCount: sections.size,
      unmatchedCalloutRatio: 0,
      minimumUniqueParts: 40,
      minimumSections: 3,
    });

    // Recompute coverage coverage_pct
    const actualUniqueParts = finalRows.length;
    const expectedTotal = Number(job.expectedPartsTotal || 0);
    const coveragePct = expectedTotal > 0 ? actualUniqueParts / expectedTotal : 0;

    // Final bom_complete must be deferred to the pricing validator.
    let finalStatus = status === "bom_complete" ? "bom_near_complete" : status;
    if (expectedTotal > 0) {
      if (coveragePct >= 1.0) {
        finalStatus = "parts_complete_pricing_missing";
      } else {
        finalStatus = "parts_partial";
      }
    }

    await completeBomJobGroup(input.jobId, input.groupId, {
      rawRowCount: newRawRows.length,
      acceptedRowCount: newRawRows.length,
    });

    await saveBomArtifacts(input.jobId, {
      retrievedSources: mergeRetrievedSources(job.retrievedSources as any[], toRetrievedSource(group as any)),
      extractedRowsRaw: mergedRawRows as any,
      finalRows: finalRows as any,
      issues: [],
      unmatchedCallouts: [],
    });

    const groups = await listBomJobGroups(input.jobId);
    const nextGroupId = groups.find((entry) => entry.status === "pending")?.id ?? null;
    const coverageScore = Math.max(0, Math.min(1, Number(reconcileResult.completenessScore || 0) / 100));

    if (!nextGroupId) {
      await completeBomJob(input.jobId, {
        brand: job.brand,
        model: job.model,
        serial: job.serial,
        productType: job.productType,
        rawRowCount: mergedRawRows.length,
        uniqueRowCount: finalRows.length,
        actualUniqueParts,
        coveragePct,
        coverageScore,
        resultStatus: finalStatus,
        issues: [],
        unmatchedCallouts: [],
        finalRows: finalRows as any,
      } as any);
    } else {
      await updateBomJobSummary(input.jobId, {
        jobStage: "awaiting_next_group",
        brand: job.brand,
        model: job.model,
        serial: job.serial,
        productType: job.productType,
        rawRowCount: mergedRawRows.length,
        uniqueRowCount: finalRows.length,
        actualUniqueParts,
        coveragePct,
        coverageScore,
        truthSource: job.truthSource,
        sourceStrategy: "diagram-group-sequenced",
        resultStatus: finalStatus,
        errorText: null,
      } as any);
    }

    return {
      job: await getBomJob(input.jobId),
      groups: await listBomJobGroups(input.jobId),
      result: {
        parts: finalRows,
        brand: job.brand,
        model: job.model,
        status,
        coverage: coverageScore,
        issues: [],
      },
      nextGroupId,
      isComplete: !nextGroupId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagram group extraction failed";
    await failBomJobGroup(input.jobId, input.groupId, message);
    await updateBomJobSummary(input.jobId, {
      jobStage: "awaiting_next_group",
      errorText: message,
    });
    throw error;
  }
}

/**
 * Optimized "Fast Path" to extract ALL remaining diagram groups for a job in parallel.
 */
export async function extractAllDiagramGroupsForJob(input: {
  jobId: string;
  concurrency?: number;
}) {
  const job = await getBomJob(input.jobId);
  if (!job) throw new Error("BOM job not found");

  const model = String(job.model || (job.identity as any)?.model || "").trim();
  if (!model) throw new Error("A reviewed model is required for bulk extraction.");

  const groups = await listBomJobGroups(input.jobId);
  const pendingGroups = groups.filter(g => g.status === "pending" || g.status === "failed");

  if (pendingGroups.length === 0) {
    return { job, groups, isComplete: true };
  }

  await updateBomJobSummary(input.jobId, {
    jobStage: "extracting_all_groups",
  });

  const envConcurrency = process.env.BOM_EXTRACTOR_CONCURRENCY ? parseInt(process.env.BOM_EXTRACTOR_CONCURRENCY, 10) : 5;
  const concurrency = input.concurrency || envConcurrency;

  const startedAt = Date.now();
  const softTimeoutMs =
    Number.parseInt(process.env.BOM_SOFT_TIMEOUT_MS ?? "45000", 10) || 45000;

  function isNearSoftTimeout() {
    return Date.now() - startedAt >= softTimeoutMs;
  }
  const allRawRows: any[] = Array.isArray(job.extractedRowsRaw) ? [...job.extractedRowsRaw] : [];
  const allRetrievedSources: any[] = Array.isArray(job.retrievedSources) ? [...job.retrievedSources] : [];

  let deliveredCount = Array.isArray(job.finalRows) ? job.finalRows.length : 0;
  let progressWrite = Promise.resolve();

  async function queueBatchPublish(args: {
    timedOut?: boolean;
    timeoutReason?: string;
  }) {
    progressWrite = progressWrite
      .catch(() => undefined)
      .then(async () => {
        const trustedTotal =
          Number(job.expectedPartsTotal || job.trustedTotalPartCount || 0) || null;

        const reconcileResult = await reconcileParts(
          normalizeModelNumber(model),
          allRawRows as any,
          { persist: false, expectedTotal: trustedTotal ?? undefined },
        );

        const allAcceptedRows = toUiParts(reconcileResult.masterParts || []);

        const acceptedSinceLastFlush =
          allAcceptedRows.length - deliveredCount;

        const remainingBefore =
          trustedTotal == null
            ? null
            : Math.max(0, trustedTotal - deliveredCount);

        const shouldFlush =
          acceptedSinceLastFlush >= BATCH_SIZE ||
          args.timedOut === true ||
          (
            remainingBefore !== null &&
            remainingBefore < BATCH_SIZE &&
            acceptedSinceLastFlush >= remainingBefore
          );

        if (!shouldFlush) return null;

        const batch = getNextBatch({
          acceptedRows: allAcceptedRows,
          alreadyDeliveredCount: deliveredCount,
          trustedTotalPartCount: trustedTotal,
          timedOut: args.timedOut,
        });

        if (batch.deliveredThisBatch <= 0) return null;

        const cumulativeRows = allAcceptedRows.slice(0, batch.deliveredTotal);

        const retrievalState =
          batch.remainingCount === 0
            ? "parts_complete_pricing_missing"
            : "parts_partial";

        await saveBomArtifacts(input.jobId, {
          retrievedSources: allRetrievedSources,
          extractedRowsRaw: allRawRows as any,
          finalRows: cumulativeRows as any,
          issues: args.timedOut
            ? [`Timeout flush: saved ${batch.deliveredThisBatch} accepted rows before timeout.`]
            : [],
          unmatchedCallouts: [],
        });

        await updateBomJobSummary(input.jobId, {
          jobStage: args.timedOut
            ? "partial_batch_flushed"
            : batch.hasMore
              ? "delivering_part_batches"
              : "parts_batch_delivery_done",
          resultStatus: retrievalState,
          retrievalState,
          uniqueRowCount: cumulativeRows.length,
          actualPartCount: cumulativeRows.length,
          actualCanonicalPartCount: cumulativeRows.length,
          expectedPartCount: trustedTotal,
          trustedTotalPartCount: trustedTotal,
          partsComplete: retrievalState === "parts_complete_pricing_missing",
          pricingComplete: false,
          bomComplete: false,
          requiredPriceCount: cumulativeRows.length,
          verifiedPriceCount: 0,
          unpricedCount: cumulativeRows.length,
          errorText: args.timedOut
            ? `Timeout flush saved ${batch.deliveredThisBatch} accepted rows. Retrieval can resume.`
            : null,
        } as any);

        deliveredCount = batch.deliveredTotal;

        return batch;
      });

    return progressWrite;
  }

  await runWithConcurrency(pendingGroups, concurrency, async (group) => {
    try {
      await markBomJobGroupRunning(input.jobId, group.id);

      let sourceText = group.sourceText;
      let sourceUrl = group.sourceUrl;

      // If text is missing (e.g. PartSelect lazy discovery), fetch it now
      if (!sourceText || sourceText.includes("(Diagram groups are typically extracted sequentially)")) {
        const html = await fetchHtml(sourceUrl);
        if (group.source === "fix.com") {
          const { parseFixRowsToText } = await import("../services/providers/fix-com");
          sourceText = `SOURCE_PROVIDER: fix.com\nMODEL: ${model}\nSECTION: ${group.groupName}\n` + 
            parseFixRowsToText(html, sourceUrl);
        } else if (group.source === "partselect-diagrams") {
          const $ = load(html);
          const psRows: any[] = [];
          $("table tr, .part-list-item").each((_, el) => {
            const partNum = cleanText($(el).find(".part-number, [itemprop='mpn']").text());
            const description = cleanText($(el).find(".part-description, [itemprop='name']").text()) || "Appliance Part";
            const diagramRef = cleanText($(el).find(".key-number").text());
            if (partNum) psRows.push({ partNumber: partNum.toUpperCase(), description, diagramRef });
          });
          sourceText = `SOURCE_PROVIDER: partselect-diagrams\nMODEL: ${model}\nSECTION: ${group.groupName}\n` + 
            psRows.map(r => `ROW|diagram_number=${r.diagramRef}|description=${r.description}|original_part_number=|current_service_part_number=${r.partNumber}|nla_status=false|replacement_note=`).join("\n");
        } else {
          sourceText = `SOURCE_PROVIDER: ${group.source}\nMODEL: ${model}\nSECTION: ${group.groupName}\nRAW_CONTENT:\n${html}`;
        }
      }

      let diagramRows = parseStructuredGroupRows(sourceText, group.source).map((row) => ({
        ...row,
        source_url: sourceUrl,
        diagram_group: group.groupName,
      }));

      // RECOVERY: If structured parser failed to find parts in the raw HTML, try Gemini
      if (diagramRows.length === 0 && (sourceText.includes("RAW_CONTENT:") || sourceText.length > 1000)) {
        console.log(`[BulkExtract] ⚠️ Structured parser found 0 parts for ${group.groupName}. Falling back to Gemini...`);
        const aiParts = await extractPartsFromHtmlPage(sourceText, { 
          model, 
          section: group.groupName 
        });
        
        if (aiParts.length > 0) {
          diagramRows = aiParts.map(p => ({
            part_number: String(p.partNumber).toUpperCase(),
            description: p.description,
            diagram_ref: p.diagramRef == null ? null : String(p.diagramRef),
            qty: p.qty || 1,
            source: group.source,
            source_url: sourceUrl,
            is_substitute: !!p.replacementNote,
            replacement_note: p.replacementNote || null,
            nla_status: p.nlaStatus,
            diagram_group: group.groupName
          }));
          console.log(`[BulkExtract] ✅ Gemini recovered ${diagramRows.length} parts for ${group.groupName}.`);
        }
      }

      const newRawRows = toRawReconcileRows(group, diagramRows);
      
      // Thread-safe update to local arrays (runWithConcurrency ensures fn completes before next for same item, 
      // but here we are in parallel, so we just use atomic-like push into the local results collection)
      allRawRows.push(...newRawRows);
      allRetrievedSources.push(toRetrievedSource(group as any));

      await completeBomJobGroup(input.jobId, group.id, {
        rawRowCount: newRawRows.length,
        acceptedRowCount: newRawRows.length,
      });

      await queueBatchPublish({});

      if (isNearSoftTimeout()) {
        await queueBatchPublish({
          timedOut: true,
          timeoutReason: "soft_timeout_flush",
        });

        throw new Error("soft_timeout_flush");
      }
    } catch (err) {
      console.error(`[BulkExtract] Failed for group ${group.id}:`, err);
      await failBomJobGroup(input.jobId, group.id, err instanceof Error ? err.message : "Extraction failed");
      
      // Attempt timeout flush on failure
      if (
        err instanceof Error &&
        (
          err.message.includes("timeout") ||
          err.message.includes("deadline") ||
          err.message.includes("soft_timeout_flush")
        )
      ) {
        await queueBatchPublish({
          timedOut: true,
          timeoutReason: "agent_timeout",
        });
      }
    }
  });

  // PERFORM SINGLE RECONCILIATION AT THE END
  const reconcileResult = await reconcileParts(
    normalizeModelNumber(model),
    allRawRows as any,
    { persist: true, expectedTotal: job.expectedPartsTotal }
  );

  const finalRows = toUiParts(reconcileResult.masterParts || []);
  const actualUniqueParts = finalRows.length;
  const expectedTotal = Number(job.expectedPartsTotal || 0);
  const coveragePct = expectedTotal > 0 ? actualUniqueParts / expectedTotal : 0;
  
  // Classify final status
  let finalStatus = classifyBomResult({
    identityConfidence: getIdentityConfidence(job),
    rows: finalRows as any,
    sectionCount: new Set(finalRows.map(p => p.section)).size,
    unmatchedCalloutRatio: 0,
    minimumUniqueParts: 40,
    minimumSections: 3,
  });

  if (finalStatus === "bom_complete") {
    finalStatus = "bom_near_complete";
  }

  if (expectedTotal > 0) {
    if (coveragePct >= 1.0) {
      finalStatus = "parts_complete_pricing_missing";
    } else {
      finalStatus = "parts_partial";
    }
  }

  await saveBomArtifacts(input.jobId, {
    retrievedSources: allRetrievedSources,
    extractedRowsRaw: allRawRows,
    finalRows: finalRows as any,
    issues: [],
    unmatchedCallouts: [],
  });

  await completeBomJob(input.jobId, {
    brand: job.brand,
    model: job.model,
    serial: job.serial,
    productType: job.productType,
    rawRowCount: allRawRows.length,
    uniqueRowCount: finalRows.length,
    actualUniqueParts,
    coveragePct,
    coverageScore: Math.max(0, Math.min(1, Number(reconcileResult.completenessScore || 0) / 100)),
    truthSource: job.truthSource,
    sourceStrategy: "diagram-group-sequenced",
    resultStatus: finalStatus,
    issues: [],
    unmatchedCallouts: [],
    finalRows: finalRows as any,
  } as any);

  return {
    job: await getBomJob(input.jobId),
    groups: await listBomJobGroups(input.jobId),
    isComplete: true,
  };
}
