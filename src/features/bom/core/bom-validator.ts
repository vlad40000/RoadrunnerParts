import type { BomRow, DiagramParse, RetrievalState } from "../schemas/bom";

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

  const totalCallouts =
    input.rows.length + input.unmatchedCallouts.length || 1;
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
    "dlpartsco.com"
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

    // Fuel Type Gate
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

    // Appliance Type Prefix Check (Simplified)
    if (input.applianceType === "dryer" && desc.includes("dishwasher")) {
      rejected.push({ part, reason: "Dishwasher component rejected for dryer model" });
      continue;
    }

    accepted.push(part);
  }

  return { accepted, rejected };
}

export function calculateCompletionProof(input: {
  expectedPartCount: number;
  totalExtracted: number;
  rows: BomRow[];
}) {
  const coverageRatio = input.expectedPartCount > 0 
    ? Math.min(input.rows.length / input.expectedPartCount, 1)
    : input.rows.length >= 40 ? 1.0 : input.rows.length / 40;

  const sourceAgreement = input.rows.some(row => (row.sourceUrl ?? "").split(";").length >= 2);

  return {
    expectedPartCount: input.expectedPartCount,
    totalExtracted: input.totalExtracted,
    coverageRatio: Number(coverageRatio.toFixed(3)),
    sourceAgreement,
  };
}
export function determineRetrievalState(input: {
  identityResolved: boolean;
  expectedPartCount: number | null;
  actualPartCount: number;
  requiredPartCount: number;
  verifiedPriceCount: number;
  unpricedCount: number;
  failed: boolean;
}): RetrievalState {
  if (input.failed) return "failed";
  if (!input.identityResolved) return "no_result";
  
  // Rule: if we found parts but zero verified prices
  if (input.actualPartCount > 0 && input.verifiedPriceCount === 0) {
    return "parts_complete_pricing_missing";
  }

  // Rule: if we have parts and some prices, but not all
  if (input.actualPartCount > 0 && input.verifiedPriceCount < input.actualPartCount) {
    return "parts_complete_pricing_partial";
  }

  // Rule: hard completion gate
  if (
    input.actualPartCount > 0 && 
    input.expectedPartCount !== null &&
    input.actualPartCount >= input.expectedPartCount && 
    input.verifiedPriceCount >= input.actualPartCount
  ) {
    return "bom_complete";
  }

  return "parts_partial";
}

export function validate_bom_completion(input: {
  rows: BomRow[];
  expectedPartCount: number | null;
  identityResolved: boolean;
}) {
  const actualPartCount = input.rows.length;
  const verifiedPriceCount = input.rows.filter(
    (r) => r.retailPrice?.status === "verified_price" || r.retailPrice?.status === "fallback_verified_price"
  ).length;
  const unpricedCount = actualPartCount - verifiedPriceCount;

  const retrievalState = determineRetrievalState({
    identityResolved: input.identityResolved,
    expectedPartCount: input.expectedPartCount,
    actualPartCount,
    requiredPartCount: input.expectedPartCount ?? actualPartCount,
    verifiedPriceCount,
    unpricedCount,
    failed: false,
  });

  return {
    retrievalState,
    expectedPartCount: input.expectedPartCount,
    actualPartCount,
    requiredPriceCount: input.expectedPartCount ?? actualPartCount,
    verifiedPriceCount,
    unpricedCount,
    bomComplete: retrievalState === "bom_complete",
    partsComplete: input.expectedPartCount !== null ? actualPartCount >= input.expectedPartCount : actualPartCount > 0,
    pricingComplete: verifiedPriceCount >= actualPartCount && actualPartCount > 0,
  };
}
