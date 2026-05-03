import type { BomRow, BomStatus } from "../schemas/bom";

type BomStatusTone = "neutral" | "red" | "amber" | "green";

export const BOM_STATUS_META: Record<
  BomStatus,
  {
    label: string;
    description: string;
    tone: BomStatusTone;
  }
> = {
  identity_only: {
    label: "identity only",
    description: "The model identity was not resolved with enough confidence.",
    tone: "neutral",
  },
  zero_rows: {
    label: "zero rows",
    description: "Sources were retrieved, but zero accepted BOM rows were extracted.",
    tone: "red",
  },
  diagram_parsed: {
    label: "diagram parsed",
    description: "Diagram parsing completed, but BOM extraction is not complete.",
    tone: "neutral",
  },
  parts_partial: {
    label: "partial rows",
    description: "Some accepted rows were extracted, but the result is still incomplete.",
    tone: "amber",
  },
  synthesis_complete: {
    label: "synthesis complete",
    description: "Search-grounded synthesis finished successfully.",
    tone: "green",
  },
  needs_fallback: {
    label: "needs fallback",
    description: "Accepted rows exist, but the job still needs additional source recovery.",
    tone: "amber",
  },
  bom_near_complete: {
    label: "bom near complete",
    description: "Accepted rows are nearly complete based on the target part count.",
    tone: "green",
  },
  bom_complete: {
    label: "bom complete",
    description: "Accepted rows and coverage passed the completion gate.",
    tone: "green",
  },
  failed: {
    label: "failed",
    description: "The extraction failed before a usable result was produced.",
    tone: "red",
  },
  no_result: {
    label: "no result",
    description: "No model or sources were found for the request.",
    tone: "red",
  },
  parts_complete_pricing_missing: {
    label: "parts complete, pricing missing",
    description: "All expected parts are present, but retail pricing is still being gathered.",
    tone: "amber",
  },
  parts_complete_pricing_partial: {
    label: "parts complete, pricing partial",
    description: "All expected parts are present, but some retail pricing is still missing.",
    tone: "amber",
  },
  sources_resolved: {
    label: "sources resolved",
    description: "Model sources have been identified and are ready for extraction.",
    tone: "neutral",
  },
};

const CANONICAL_STATUSES = new Set<BomStatus>(
  Object.keys(BOM_STATUS_META) as BomStatus[],
);

export function normalizeBomStatus(
  status: string | null | undefined,
  rowCount = 0,
): BomStatus {
  if (status === "sources_found") {
    return "zero_rows";
  }

  if (
    rowCount === 0 &&
    status !== "identity_only" &&
    status !== "failed"
  ) {
    return "zero_rows";
  }

  if (status && CANONICAL_STATUSES.has(status as BomStatus)) {
    return status as BomStatus;
  }

  return rowCount === 0 ? "zero_rows" : "parts_partial";
}

export function getBomStatusMeta(
  status: string | null | undefined,
  rowCount = 0,
) {
  const key = normalizeBomStatus(status, rowCount);
  return {
    key,
    ...BOM_STATUS_META[key],
  };
}

export function classifyBomResult(input: {
  identityConfidence: number;
  rows: BomRow[];
  sectionCount: number;
  unmatchedCalloutRatio: number;
  minimumUniqueParts?: number;
  minimumSections?: number;
}): BomStatus {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;
  const minimumSections = input.minimumSections ?? 3;

  const uniquePartCount = new Set(
    input.rows.map((p) => (p.currentServicePartNumber || p.originalPartNumber || "").toUpperCase().trim()).filter(Boolean)
  ).size;

  if (input.identityConfidence < 0.9) return "identity_only";
  if (input.rows.length === 0) return "zero_rows";
  if (input.sectionCount === 0) return "parts_partial";
  if (uniquePartCount < minimumUniqueParts) return "needs_fallback";
  if (input.sectionCount < minimumSections) return "needs_fallback";
  if (input.unmatchedCalloutRatio > 0.2) return "needs_fallback";
  return "bom_complete";
}
