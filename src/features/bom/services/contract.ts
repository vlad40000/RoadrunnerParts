import { RetrievalState } from "../schemas/bom";

export type TrustedCountSource =
  | "sears-partsdirect"
  | "repairclinic-family"
  | "appliancepartspros"
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

  if (
    normalized === "sears-partsdirect" ||
    normalized === "searspartsdirect.com" ||
    normalized === "sears"
  ) {
    return "sears-partsdirect";
  }
  if (
    normalized === "repairclinic" ||
    normalized === "repairclinic-family" ||
    normalized === "repairclinic.com"
  ) {
    return "repairclinic-family";
  }
  if (
    normalized === "appliancepartspros" ||
    normalized === "appliancepartspros.com"
  ) {
    return "appliancepartspros";
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
      state: "sources_resolved" as RetrievalState,
      reason: "No trusted total part count has been accepted.",
    };
  }

  if (input.actualCanonicalPartCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: `Stored ${input.actualCanonicalPartCount} parts, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  return {
    partsComplete: true,
    state: "parts_complete_pricing_missing" as RetrievalState,
    reason: "Stored canonical parts meet trusted total part count.",
  };
}

export const RETAIL_PRICING_SOURCE_PRIORITY = [
  "fix.com",
  "sears-partsdirect",
  "repairclinic-family",
  "appliancepartspros",
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
      state: "sources_resolved" as RetrievalState,
      reason: "No trusted total part count has been accepted.",
    };
  }

  if (input.manifestRowCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: `Manifest has ${input.manifestRowCount} rows, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  if (input.requiredManifestRowCount <= 0) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: "Manifest has no required rows.",
    };
  }

  if (input.unresolvedRequiredManifestRowCount > 0) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: `${input.unresolvedRequiredManifestRowCount} required manifest rows are unresolved.`,
    };
  }

  if (input.mappedRequiredManifestRowCount < input.requiredManifestRowCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: `Mapped ${input.mappedRequiredManifestRowCount} required rows, manifest requires ${input.requiredManifestRowCount}.`,
    };
  }

  if (input.actualCanonicalPartCount < input.trustedTotalPartCount) {
    return {
      partsComplete: false,
      state: "parts_partial" as RetrievalState,
      reason: `Stored ${input.actualCanonicalPartCount} canonical parts, trusted source requires ${input.trustedTotalPartCount}.`,
    };
  }

  return {
    partsComplete: true,
    state: "parts_complete_pricing_missing" as RetrievalState,
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

  const partsComplete = input.actualPartCount >= trustedTotalPartCount;
  const pricingComplete = partsComplete && input.verifiedPriceCount >= input.requiredPriceCount && input.actualPartCount > 0;

  if (partsComplete && pricingComplete) {
    return "bom_complete";
  }

  if (partsComplete && !pricingComplete) {
    if (input.verifiedPriceCount > 0) return "parts_complete_pricing_partial";
    return "parts_complete_pricing_missing";
  }

  return "parts_partial";
}
