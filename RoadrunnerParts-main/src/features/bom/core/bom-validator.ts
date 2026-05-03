import type { BomRow, DiagramParse, RetrievalState } from "../schemas/bom";
import {
  validateManifestCoverage,
  validatePartsCompleteness,
} from "../services/contract";

export function computeUnmatchedCallouts(
  diagramData: DiagramParse,
  rows: BomRow[],
) {
  const seen = new Set(
    rows.map((r) => String(r.diagramNumber).trim().toUpperCase()),
  );

  const unmatched: Array<number | string> = [];

  for (const section of diagramData.sections) {
    for (const callout of section.callouts) {
      const key = String(callout).trim().toUpperCase();
      if (!seen.has(key)) unmatched.push(callout);
    }
  }

  return unmatched;
}

export function coverageScore(input: {
  rows: BomRow[];
  sectionsFound: string[];
  unmatchedCallouts: Array<number | string>;
  minimumUniqueParts?: number;
}) {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;
  const partScore = Math.min(input.rows.length / minimumUniqueParts, 1);
  const sectionScore = Math.min(input.sectionsFound.length / 4, 1);
  const totalCallouts = input.rows.length + input.unmatchedCallouts.length || 1;
  const calloutScore = 1 - input.unmatchedCallouts.length / totalCallouts;

  return Number(((partScore * 0.45) + (sectionScore * 0.2) + (calloutScore * 0.35)).toFixed(3));
}

export type BomPartCandidate = Partial<BomRow> & {
  partNumber: string;
  evidence: string;
};

export type RejectedPart = {
  part: any;
  reason: string;
};

export function validateLiveParts(input: {
  model: string;
  applianceType: string | null;
  fuelType: "electric" | "gas" | "other" | null;
  parts: any[];
}) {
  const rejected: RejectedPart[] = [];
  const accepted: BomRow[] = [];

  const APPROVED_SOURCES = [
    "fix.com",
    "searspartsdirect.com",
    "encompass.com",
    "partselect.com",
    "repairclinic.com",
    "reliableparts.com",
    "dlpartsco.com",
    "partsdr.com",
    "appliancepartspros.com"
  ];

  for (const part of input.parts) {
    const partNumber = (part.currentServicePartNumber || part.originalPartNumber || part.partNumber)?.trim().toUpperCase();

    if (!partNumber) {
      rejected.push({ part, reason: "Missing part number" });
      continue;
    }

    if (!part.sourceUrl) {
      rejected.push({ part, reason: "Missing source URL" });
      continue;
    }

    const isApproved = APPROVED_SOURCES.some(src => part.sourceUrl.includes(src));
    if (!isApproved) {
      rejected.push({ part, reason: "Unapproved source" });
      continue;
    }

    const desc = `${part.description || ""} ${part.section || ""}`.toLowerCase();
    if (input.fuelType === "electric") {
      const gasKeywords = ["gas valve", "burner", "igniter", "flame sensor", "gas tube", "lp conversion"];
      if (gasKeywords.some(k => desc.includes(k))) {
        rejected.push({ part, reason: "Gas component rejected for electric model" });
        continue;
      }
    }

    if (input.fuelType === "gas") {
      const electricOnlyKeywords = ["heating element", "electric heater"];
      if (electricOnlyKeywords.some(k => desc.includes(k)) && !desc.includes("igniter")) {
        rejected.push({ part, reason: "Electric heating element rejected for gas model" });
        continue;
      }
    }

    if (input.applianceType === "dryer" && desc.includes("dishwasher")) {
      rejected.push({ part, reason: "Dishwasher component rejected for dryer model" });
      continue;
    }

    accepted.push(part);
  }

  return { accepted, rejected };
}

export function determineRetrievalState(input: {
  identityResolved: boolean;
  partsComplete: boolean;
  pricingComplete: boolean;
  actualPartCount: number;
  verifiedPriceCount: number;
  failed: boolean;
}): RetrievalState {
  if (input.failed) return "failed";
  if (!input.identityResolved) return "no_result";
  
  if (input.partsComplete && input.pricingComplete) {
    return "bom_complete";
  }

  if (input.partsComplete && !input.pricingComplete) {
    if (input.verifiedPriceCount > 0) return "parts_complete_pricing_partial";
    return "parts_complete_pricing_missing";
  }

  return "parts_partial";
}

export function validate_bom_completion(input: {
  rows: BomRow[];
  expectedPartCount?: number | null;
  trustedTotalPartCount?: number | null;
  manifestRowCount?: number;
  requiredManifestRowCount?: number;
  mappedRequiredManifestRowCount?: number;
  unresolvedRequiredManifestRowCount?: number;
  identityResolved: boolean;
}) {
  const actualPartCount = input.rows.length;
  const trustedTotalPartCount = input.trustedTotalPartCount ?? input.expectedPartCount ?? null;
  const hasManifest = (input.manifestRowCount ?? 0) > 0 || (input.requiredManifestRowCount ?? 0) > 0;
  
  const partsCompletion = hasManifest
    ? validateManifestCoverage({
        trustedTotalPartCount,
        manifestRowCount: input.manifestRowCount ?? 0,
        requiredManifestRowCount: input.requiredManifestRowCount ?? 0,
        mappedRequiredManifestRowCount: input.mappedRequiredManifestRowCount ?? 0,
        unresolvedRequiredManifestRowCount: input.unresolvedRequiredManifestRowCount ?? 0,
        actualCanonicalPartCount: actualPartCount,
      })
    : validatePartsCompleteness({
        trustedTotalPartCount,
        actualCanonicalPartCount: actualPartCount,
      });

  const verifiedPriceCount = input.rows.filter(
    (r) => r.retailPriceVerified === true
  ).length;
  
  const unpricedCount = actualPartCount - verifiedPriceCount;

  // Pricing is ONLY complete if Parts are Complete and all rows have prices.
  const pricingComplete =
    partsCompletion.partsComplete &&
    actualPartCount > 0 &&
    verifiedPriceCount >= actualPartCount;

  const retrievalState = determineRetrievalState({
    identityResolved: input.identityResolved,
    partsComplete: partsCompletion.partsComplete,
    pricingComplete,
    actualPartCount,
    verifiedPriceCount,
    failed: false,
  });

  return {
    retrievalState,
    expectedPartCount: trustedTotalPartCount,
    trustedTotalPartCount,
    actualPartCount,
    actualCanonicalPartCount: actualPartCount,
    requiredPriceCount: actualPartCount,
    verifiedPriceCount,
    unpricedCount,
    bomComplete: retrievalState === "bom_complete",
    partsComplete: partsCompletion.partsComplete,
    partsCompletenessReason: partsCompletion.reason,
    pricingComplete,
    reason: partsCompletion.partsComplete 
      ? (pricingComplete ? "BOM complete." : "Pricing incomplete.")
      : "Structural pricing dependency: pricing cannot be complete if parts are incomplete."
  };
}
