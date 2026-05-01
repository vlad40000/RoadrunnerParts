import "server-only";

import {
  getBomJob,
  saveBomArtifacts,
  completeBomJob,
  setBomJobStage,
} from "../services/job-store";
import { fetchSourcesFromSpecificProviders } from "../services/source-fetcher";
import { runPartsExtractor } from "../agents/parts-extractor";
import { normalizeBomRows } from "./bom-normalizer";
import { computeUnmatchedCallouts, coverageScore } from "./bom-validator";
import { classifyBomResult, normalizeBomStatus } from "./bom-status";
import { buildRecoveryPlan } from "./recovery-plan";
import { normalizeSectionName } from "../../identity/normalize";
import type { BomRow, BomStatus } from "../schemas/bom";
import { type ProviderSourceType } from "../services/providers/types";

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSection(value: string | null | undefined) {
  return normalizeSectionName(value);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function uniqueSources<T extends { provider?: string; sourceUrl?: string; sectionName?: string }>(
  items: T[],
) {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = [
      cleanText(item.provider),
      cleanText(item.sectionName),
      cleanText(item.sourceUrl),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function extractRowsFromSources(input: {
  sources: Array<{
    sourceText?: string;
    text?: string;
    sourceUrl: string;
    sourceType: ProviderSourceType;
  }>;
  targetSections: string[];
  modelNumber: string;
}) {
  const incrementalRows: BomRow[] = [];
  const allowed = new Set(input.targetSections.map((s) => normalizeSection(s)));

  for (const source of input.sources) {
    const result = await runPartsExtractor({
      sourceText: source.text ?? source.sourceText ?? "",
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType,
      modelNumber: input.modelNumber,
    });

    const rows = result?.rows || [];

    if (allowed.size > 0) {
      incrementalRows.push(
        ...rows.filter((row) => allowed.has(normalizeSection(row.section))),
      );
    } else {
      incrementalRows.push(...rows);
    }
  }

  return incrementalRows;
}

function evaluateResult(input: {
  identityConfidence: number;
  rows: BomRow[];
  diagramParse: {
    sections?: Array<{ sectionName?: string; callouts?: Array<string | number> }>;
  };
  minimumUniqueParts: number;
  minimumSections: number;
}) {
  const sectionsFound = unique(input.rows.map((r) => r.section).filter(Boolean));

  const hasUserDiagramSections = (input.diagramParse.sections ?? []).length > 0;

  const unmatchedCallouts = hasUserDiagramSections
    ? computeUnmatchedCallouts(
        { sections: input.diagramParse.sections ?? [] } as any,
        input.rows,
      )
    : [];

  const totalVisibleCallouts = hasUserDiagramSections
    ? (input.diagramParse.sections ?? []).flatMap((s) => s.callouts ?? []).length
    : 0;

  const unmatchedCalloutRatio =
    totalVisibleCallouts > 0
      ? unmatchedCallouts.length / totalVisibleCallouts
      : 0;

  const status: BomStatus = classifyBomResult({
    identityConfidence: input.identityConfidence,
    rows: input.rows,
    sectionCount: sectionsFound.length,
    unmatchedCalloutRatio,
    minimumUniqueParts: input.minimumUniqueParts,
    minimumSections: input.minimumSections,
  });

  const score = coverageScore({
    rows: input.rows,
    sectionsFound,
    unmatchedCallouts,
    minimumUniqueParts: input.minimumUniqueParts,
  });

  return {
    sectionsFound,
    unmatchedCallouts,
    unmatchedCalloutRatio,
    status,
    coverageScore: score,
  };
}

function stillNeedsFallback(input: {
  status: BomStatus;
  rows: BomRow[];
  minimumUniqueParts: number;
  sectionCount: number;
  minimumSections: number;
  targetSections: string[];
}) {
  const uniquePartCount = new Set(
    input.rows.map((p) => (p.currentServicePartNumber || p.originalPartNumber || "").toUpperCase().trim()).filter(Boolean)
  ).size;

  if (input.status === "bom_complete") return false;
  if (uniquePartCount < input.minimumUniqueParts) return true;
  if (input.sectionCount < input.minimumSections) return true;
  if (input.targetSections.length > 0) return true;
  return input.status === "needs_fallback" || input.status === "parts_partial";
}

export async function runTargetedBomRecovery(input: {
  jobId: string;
  minimumUniqueParts?: number;
  minimumSections?: number;
}) {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;
  const minimumSections = input.minimumSections ?? 3;

  const job = await getBomJob(input.jobId);
  if (!job) {
    throw new Error("BOM job not found");
  }

  const identity = (job.identity ?? null) as
    | {
        brand?: string | null;
        resolvedBrand?: string | null;
        model?: string | null;
        serial?: string | null;
        productType?: string | null;
        confidence?: number;
      }
    | null;

  const brand = identity?.resolvedBrand ?? identity?.brand ?? job.brand ?? null;
  const model = identity?.model ?? job.model ?? null;
  const serial = identity?.serial ?? job.serial ?? null;
  const productType = identity?.productType ?? job.productType ?? null;
  const identityConfidence = identity?.confidence ?? 1;

  if (!model) {
    throw new Error("Recovery requires a saved model identity");
  }

  const existingSources = Array.isArray(job.retrievedSources)
    ? job.retrievedSources
    : [];

  const existingRows = (Array.isArray(job.finalRows) ? job.finalRows : []) as BomRow[];

  const diagramParse = (job.diagramParse ?? { sections: [] }) as {
    sections?: Array<{ sectionName?: string; callouts?: Array<string | number> }>;
  };

  const plan = buildRecoveryPlan({
    brand,
    model,
    diagramParse,
    retrievedSources: existingSources,
    finalRows: existingRows,
    uniqueRowCount: existingRows.length,
    minimumUniqueParts,
  });

  if (!plan.shouldRecover) {
    return {
      recovered: false,
      plan,
      result: {
        brand,
        model,
        serial,
        productType,
        sectionsFound: unique(existingRows.map((r) => r.section).filter(Boolean)),
        rawRowCount: Array.isArray(job.extractedRowsRaw)
          ? job.extractedRowsRaw.length
          : existingRows.length,
        uniqueRowCount: existingRows.length,
        unmatchedCallouts: Array.isArray(job.unmatchedCallouts)
          ? job.unmatchedCallouts
          : [],
        status: normalizeBomStatus(job.resultStatus, existingRows.length),
        rows: existingRows,
        issues: Array.isArray(job.issues) ? job.issues : [],
        coverageScore: Number(job.coverageScore ?? 0),
      },
    };
  }

  await setBomJobStage(input.jobId, "recovering");

  let recoverySources: any[] = [];
  let incrementalRows: BomRow[] = [];
  let recoveryIssues: string[] = [];

  let mergedRows = normalizeBomRows([...existingRows]);
  let evaluation = evaluateResult({
    identityConfidence,
    rows: mergedRows,
    diagramParse,
    minimumUniqueParts,
    minimumSections,
  });

  if (plan.familyPrimaryProviders.length > 0) {
    const familySources = await fetchSourcesFromSpecificProviders({
      brand,
      model,
      productType,
      providerNames: plan.familyPrimaryProviders,
      targetSections: plan.targetSections.length ? plan.targetSections : undefined,
    });

    const familyRows = await extractRowsFromSources({
      sources: familySources,
      targetSections: plan.targetSections,
      modelNumber: model || "UNKNOWN",
    });

    recoverySources = [...recoverySources, ...familySources];
    incrementalRows = [...incrementalRows, ...familyRows];
    mergedRows = normalizeBomRows([...existingRows, ...incrementalRows]);

    evaluation = evaluateResult({
      identityConfidence,
      rows: mergedRows,
      diagramParse,
      minimumUniqueParts,
      minimumSections,
    });

    if (familyRows.length > 0) {
      recoveryIssues.push("OEM family recovery produced additional rows before distributor fallback.");
    } else {
      recoveryIssues.push("OEM family recovery was attempted before distributor fallback but produced no accepted rows.");
    }
  }

  const shouldRunFallback =
    plan.distributorFallbackProviders.length > 0 &&
    stillNeedsFallback({
      status: evaluation.status,
      rows: mergedRows,
      minimumUniqueParts,
      sectionCount: evaluation.sectionsFound.length,
      minimumSections,
      targetSections: plan.targetSections,
    });

  if (shouldRunFallback) {
    const fallbackSources = await fetchSourcesFromSpecificProviders({
      brand,
      model,
      productType,
      providerNames: plan.distributorFallbackProviders,
      targetSections: plan.targetSections.length ? plan.targetSections : undefined,
    });

    const fallbackRows = await extractRowsFromSources({
      sources: fallbackSources,
      targetSections: plan.targetSections,
      modelNumber: model || "UNKNOWN",
    });

    recoverySources = [...recoverySources, ...fallbackSources];
    incrementalRows = [...incrementalRows, ...fallbackRows];
    mergedRows = normalizeBomRows([...existingRows, ...incrementalRows]);

    evaluation = evaluateResult({
      identityConfidence,
      rows: mergedRows,
      diagramParse,
      minimumUniqueParts,
      minimumSections,
    });

    if (fallbackRows.length > 0) {
      recoveryIssues.push("Distributor fallback added additional rows after OEM family retry.");
    } else {
      recoveryIssues.push("Distributor fallback ran after OEM family retry but produced no accepted rows.");
    }
  }

  const issues: string[] = [];

  if (mergedRows.length === 0) {
    issues.push("Recovery finished with zero accepted BOM rows.");
  } else {
    if (mergedRows.length < minimumUniqueParts) {
      issues.push("Part count below target threshold.");
    }

    if (evaluation.sectionsFound.length < minimumSections) {
      issues.push("Too few sections recovered.");
    }
  }

  if (evaluation.unmatchedCallouts.length > 0) {
    issues.push("Some visible diagram callouts were not matched.");
  }

  issues.push(...plan.reasons);
  issues.push(...recoveryIssues);

  const dedupedIssues = unique(issues);

  const mergedSources = uniqueSources([
    ...existingSources,
    ...recoverySources,
  ]);

  const mergedExtractedRowsRaw = [
    ...(Array.isArray(job.extractedRowsRaw) ? job.extractedRowsRaw : []),
    ...incrementalRows,
  ];

  await saveBomArtifacts(input.jobId, {
    retrievedSources: mergedSources as any,
    extractedRowsRaw: mergedExtractedRowsRaw as any,
    finalRows: mergedRows as any,
    unmatchedCallouts: evaluation.unmatchedCallouts,
    issues: dedupedIssues,
  });

  await completeBomJob(input.jobId, {
    brand,
    model,
    serial,
    productType,
    rawRowCount: mergedExtractedRowsRaw.length,
    uniqueRowCount: mergedRows.length,
    coverageScore: evaluation.coverageScore,
    resultStatus: evaluation.status,
    issues: dedupedIssues,
    unmatchedCallouts: evaluation.unmatchedCallouts,
    finalRows: mergedRows as any,
  });

  return {
    recovered: true,
    plan,
    result: {
      brand,
      model,
      serial,
      productType,
      sectionsFound: evaluation.sectionsFound,
      rawRowCount: mergedExtractedRowsRaw.length,
      uniqueRowCount: mergedRows.length,
      unmatchedCallouts: evaluation.unmatchedCallouts,
      status: normalizeBomStatus(evaluation.status, mergedRows.length),
      rows: mergedRows,
      issues: dedupedIssues,
      coverageScore: evaluation.coverageScore,
    },
  };
}
