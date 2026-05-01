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
  not_checked: {
    label: "not checked",
    description: "The model identity was not resolved with enough confidence.",
    tone: "neutral",
  },
  no_result: {
    label: "no result",
    description: "No model or sources could be identified for this search.",
    tone: "red",
  },
  summary_only: {
    label: "summary only",
    description: "Model found, but no diagrams or parts were extracted.",
    tone: "amber",
  },
  parts_partial: {
    label: "partial rows",
    description: "Some accepted rows were extracted, but coverage is low.",
    tone: "amber",
  },
  needs_fallback: {
    label: "needs fallback",
    description: "Structural BOM found, but missing critical part metadata.",
    tone: "amber",
  },
  bom_near_complete: {
    label: "bom near complete",
    description: "BOM coverage is high but missing a few expected parts.",
    tone: "green",
  },
  bom_complete: {
    label: "bom complete",
    description: "BOM is fully extracted and verified against targets.",
    tone: "green",
  },
  db_complete: {
    label: "db complete",
    description: "A complete BOM already exists in the database.",
    tone: "green",
  },
  seed_route_only: {
    label: "seed route only",
    description: "Model route exists in seeds, but no sections or part rows are loaded.",
    tone: "neutral",
  },
  seed_sections_only: {
    label: "seed sections only",
    description: "Sections/diagrams exist in seeds, but no part rows yet.",
    tone: "neutral",
  },
  seed_parts_partial: {
    label: "seed parts partial",
    description: "Some seeded part rows exist, but coverage is below target.",
    tone: "amber",
  },
  seed_bom_candidate: {
    label: "seed bom candidate",
    description: "Seed has enough rows/sections to possibly satisfy BOM.",
    tone: "green",
  },
  needs_live_gap_fill: {
    label: "needs live gap-fill",
    description: "Seed exists but missing sections or low part count require live providers.",
    tone: "amber",
  },
  cache_hit: {
    label: "cache hit",
    description: "A cached BOM result was reused.",
    tone: "green",
  },
  failed: {
    label: "failed",
    description: "The extraction failed due to a technical error.",
    tone: "red",
  },
};

const CANONICAL_STATUSES = new Set<BomStatus>(
  Object.keys(BOM_STATUS_META) as BomStatus[],
);

export function normalizeBomStatus(
  status: string | null | undefined,
  rowCount = 0,
): BomStatus {
  if (status === "sources_found" || status === "zero_rows") {
    return "summary_only";
  }

  if (
    rowCount === 0 &&
    status !== "not_checked" &&
    status !== "failed" &&
    status !== "no_result"
  ) {
    return "summary_only";
  }

  if (status && CANONICAL_STATUSES.has(status as BomStatus)) {
    return status as BomStatus;
  }

  return rowCount === 0 ? "no_result" : "parts_partial";
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
  expectedTotal?: number | null;
  coveragePct?: number;
  retrievedSources?: Array<{ text: string; meta?: any }>;
}): BomStatus {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;
  const minimumSections = input.minimumSections ?? 3;

  const uniquePartCount = new Set(
    input.rows.map((p) => (p.currentServicePartNumber || p.originalPartNumber || "").toUpperCase().trim()).filter(Boolean)
  ).size;

  if (input.identityConfidence < 0.9) return "not_checked";

  const seedSource = input.retrievedSources?.find(s => s.meta?.isSeed);
  const isSeedOnly = !!seedSource && input.rows.every(r => r.sourceType === "distributor" || r.sourceType === "oem"); // Basic check

  if (input.rows.length === 0) {
    if (seedSource) {
      if (seedSource.text.includes("SOURCE_STATUS: route_only")) return "seed_route_only";
      if (seedSource.text.includes("SOURCE_STATUS: sections_only")) return "seed_sections_only";
    }
    return "summary_only";
  }

  if (input.sectionCount === 0) return "parts_partial";

  const coverageRatio = input.coveragePct ?? (input.expectedTotal ? uniquePartCount / input.expectedTotal : 0);

  if (seedSource) {
    if (coverageRatio >= 0.9 && input.sectionCount >= minimumSections) return "seed_bom_candidate";
    return "seed_parts_partial";
  }

  if (uniquePartCount < minimumUniqueParts) return "needs_fallback";
  if (input.sectionCount < minimumSections) return "needs_fallback";
  if (input.unmatchedCalloutRatio > 0.2) return "needs_fallback";

  return coverageRatio >= 0.9 ? "bom_complete" : "bom_near_complete";
}

