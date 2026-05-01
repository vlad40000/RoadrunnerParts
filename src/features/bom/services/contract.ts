import { RetrievalState } from "../schemas/bom";

export type TrustedCountSource =
  | "encompass"
  | "sears-partsdirect"
  | "partsdr"
  | "appliancepartspros"
  | "partselect.com"
  | "fix.com";

export type TrustedPartCountAcceptance =
  | {
      accepted: false;
      reason: string;
    }
  | {
      accepted: true;
      trustedTotalPartCount: number;
      trustedTotalCountSource: TrustedCountSource;
      trustedTotalCountSourceUrl: string;
      trustedTotalCountCheckedAt: Date;
    };

export function normalizeTrustedCountSource(
  source: string | null | undefined,
): TrustedCountSource | null {
  const normalized = String(source || "").trim().toLowerCase();

  if (normalized === "encompass" || normalized === "encompass-family") {
    return "encompass";
  }
  if (
    normalized === "sears-partsdirect" ||
    normalized === "searspartsdirect.com" ||
    normalized === "sears"
  ) {
    return "sears-partsdirect";
  }
  if (normalized === "partsdr" || normalized === "partsdr.com") {
    return "partsdr";
  }
  if (
    normalized === "appliancepartspros" ||
    normalized === "appliancepartspros.com"
  ) {
    return "appliancepartspros";
  }
  if (normalized === "partselect" || normalized === "partselect.com") {
    return "partselect.com";
  }
  if (normalized === "fix" || normalized === "fix.com") {
    return "fix.com";
  }

  return null;
}

export function acceptTrustedPartCount(input: {
  source: TrustedCountSource;
  normalizedModel: string;
  sourceModel: string;
  statedPartCount: number | null;
  sourceUrl: string;
  checkedAt?: Date;
}): TrustedPartCountAcceptance {
  const exactModelMatch =
    input.sourceModel.trim().toUpperCase() ===
    input.normalizedModel.trim().toUpperCase();

  if (!exactModelMatch) {
    return {
      accepted: false,
      reason: "Source model does not exactly match normalized model.",
    };
  }

  if (!input.statedPartCount || input.statedPartCount <= 0) {
    return {
      accepted: false,
      reason: "No valid stated part count found.",
    };
  }

  return {
    accepted: true,
    trustedTotalPartCount: input.statedPartCount,
    trustedTotalCountSource: input.source,
    trustedTotalCountSourceUrl: input.sourceUrl,
    trustedTotalCountCheckedAt: input.checkedAt ?? new Date(),
  };
}

export function validatePartsCompleteness(input: {
  trustedTotalPartCount: number | null;
  actualCanonicalPartCount: number;
}) {
  if (!input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "sources_resolved" as const,
      reason: "No trusted total part count has been accepted.",
    };
  }

  if (input.actualCanonicalPartCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: `Stored ${input.actualCanonicalPartCount} parts, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  return {
    partsComplete: true,
    state: "parts_complete" as const,
    reason: "Stored canonical parts meet trusted total part count.",
  };
}

export const RETAIL_PRICING_SOURCE_PRIORITY = [
  "encompass",
  "partsdr",
  "appliancepartspros",
  "partselect.com",
  "fix.com",
  "sears-partsdirect",
] as const;

export function validateManifestCoverage(input: {
  trustedTotalPartCount: number | null;
  manifestRowCount: number;
  requiredManifestRowCount: number;
  mappedRequiredManifestRowCount: number;
  unresolvedRequiredManifestRowCount: number;
  actualCanonicalPartCount: number;
}) {
  if (!input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "sources_resolved" as const,
      reason: "No trusted total part count has been accepted.",
    };
  }

  if (input.manifestRowCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: `Manifest has ${input.manifestRowCount} rows, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  if (input.requiredManifestRowCount <= 0) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: "Manifest has no required rows.",
    };
  }

  if (input.unresolvedRequiredManifestRowCount > 0) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: `${input.unresolvedRequiredManifestRowCount} required manifest rows are unresolved.`,
    };
  }

  if (input.mappedRequiredManifestRowCount < input.requiredManifestRowCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: `Mapped ${input.mappedRequiredManifestRowCount} required rows, manifest requires ${input.requiredManifestRowCount}.`,
    };
  }

  if (input.actualCanonicalPartCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as const,
      reason: `Stored ${input.actualCanonicalPartCount} canonical parts, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  return {
    partsComplete: true,
    state: "parts_complete" as const,
    reason: "Manifest rows are fully mapped to stored canonical parts.",
  };
}

export type BomCompletionContract = {
  identityResolved: boolean;

  trustedTotalPartCount: number | null;
  actualCanonicalPartCount: number;

  requiredPriceCount: number;
  verifiedPriceCount: number;

  partsComplete: boolean;
  pricingComplete: boolean;
  bomComplete: boolean;
};

export function determineRetrievalState(input: {
  identityResolved: boolean;
  expectedPartCount?: number | null;
  trustedTotalPartCount?: number | null;
  actualPartCount: number;
  requiredPriceCount: number;
  verifiedPriceCount: number;
  failed: boolean;
}): RetrievalState {
  if (input.failed) return "failed";

  if (!input.identityResolved) return "no_result";

  const trustedTotalPartCount =
    input.trustedTotalPartCount ?? input.expectedPartCount ?? null;

  if (!trustedTotalPartCount || input.actualPartCount === 0) {
    return "identity_only";
  }

  // If we found sources but haven't extracted parts yet, that would be "sources_resolved"
  // but this function seems to focus on the post-extraction gate.
  // We'll stick to the user's provided logic exactly.

  if (input.actualPartCount < trustedTotalPartCount) {
    return "parts_partial";
  }

  if (input.verifiedPriceCount === 0) {
    return "parts_complete_pricing_missing";
  }

  if (input.verifiedPriceCount < input.requiredPriceCount) {
    return "parts_complete_pricing_partial";
  }

  if (
    input.actualPartCount >= trustedTotalPartCount &&
    input.verifiedPriceCount >= input.requiredPriceCount
  ) {
    return "bom_complete";
  }

  return "failed";
}
