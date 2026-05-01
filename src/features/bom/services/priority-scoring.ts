import { cleanText } from "./providers/utils";

export type RecommendedAction =
  | "inspect_first"
  | "repair_and_sell_whole"
  | "sell_whole_as_is"
  | "part_out"
  | "hold_for_parts"
  | "wholesale"
  | "scrap"
  | "manual_review";

export type PriorityScoreResult = {
  score: number;
  recommendedAction: RecommendedAction;
  reasonCodes: string[];
  factors: string[];
};

export interface ScorableMachine {
  ageMonths: number | null;
  msrp: number | null;
  brand: string | null;
  applianceType: string | null;
  condition: string | null;
  verifiedPartRetailValue: number;
  ebayDemandSignal: "strong" | "medium" | "weak" | "none";
  decodeConfidence: "high" | "medium" | "low" | "none";
  laborRisk: number; // 0-100
  storageRisk: number; // 0-100
}

export function calculateMachinePriority(data: ScorableMachine): PriorityScoreResult {
  let score = 0;
  const factors: string[] = [];
  const reasonCodes: string[] = [];

  // 1. Age Score (Weight: 25)
  if (data.ageMonths !== null) {
    // Newer is better. Linear decay from 0 months to 240 months (20 years)
    const agePoints = Math.max(0, 25 * (1 - data.ageMonths / 240));
    score += agePoints;
    factors.push(`Age (${data.ageMonths}mo): ${agePoints.toFixed(1)}`);
  } else {
    reasonCodes.push("MISSING_AGE");
  }

  // 2. MSRP Score (Weight: 20)
  if (data.msrp !== null) {
    // Capped at $3000
    const msrpPoints = Math.min(20, (data.msrp / 3000) * 20);
    score += msrpPoints;
    factors.push(`MSRP ($${data.msrp}): ${msrpPoints.toFixed(1)}`);
  } else {
    reasonCodes.push("MISSING_MSRP");
  }

  // 3. Verified Part Value Score (Weight: 25)
  // Capped at $1500 verified retail value
  const valuePoints = Math.min(25, (data.verifiedPartRetailValue / 1500) * 25);
  score += valuePoints;
  factors.push(`Part Value ($${data.verifiedPartRetailValue}): ${valuePoints.toFixed(1)}`);

  // 4. eBay Demand Score (Weight: 20)
  const demandMap = { strong: 20, medium: 12, weak: 5, none: 0 };
  const demandPoints = demandMap[data.ebayDemandSignal] || 0;
  score += demandPoints;
  factors.push(`eBay Demand (${data.ebayDemandSignal}): ${demandPoints}`);

  // 5. Condition Score (Weight: 10)
  const condition = (data.condition || "").toLowerCase();
  let conditionPoints = 0;
  if (condition.includes("working") || condition.includes("new")) conditionPoints = 10;
  else if (condition.includes("needs repair")) conditionPoints = 5;
  score += conditionPoints;
  factors.push(`Condition (${data.condition}): ${conditionPoints}`);

  // 6. Risk Penalties
  const storagePenalty = (data.storageRisk / 100) * 10;
  score -= storagePenalty;
  if (storagePenalty > 0) factors.push(`Storage Risk: -${storagePenalty.toFixed(1)}`);

  const laborPenalty = (data.laborRisk / 100) * 15;
  score -= laborPenalty;
  if (laborPenalty > 0) factors.push(`Labor Risk: -${laborPenalty.toFixed(1)}`);

  if (reasonCodes.length > 0) {
    const missingDataPenalty = 15;
    score -= missingDataPenalty;
    factors.push(`Missing Data Penalty: -${missingDataPenalty}`);
  }

  // Final scale: 0-100 normalized to 0-1000
  const finalScore = Math.max(0, Math.min(1000, score * 10));

  // Recommended Action Logic
  let recommendedAction: RecommendedAction = "manual_review";

  const isNewer = data.ageMonths !== null && data.ageMonths < 60; // < 5 years
  const isHighMsrp = data.msrp !== null && data.msrp > 1200;
  const isHighPartValue = data.verifiedPartRetailValue > 600;
  const isStrongDemand = data.ebayDemandSignal === "strong";
  
  if (data.decodeConfidence === "low" || data.decodeConfidence === "none") {
    recommendedAction = "manual_review";
  } else if (isNewer && isHighMsrp && (!data.condition || data.condition === "unknown")) {
    recommendedAction = "inspect_first";
  } else if (condition.includes("working")) {
    recommendedAction = isHighMsrp ? "repair_and_sell_whole" : "sell_whole_as_is";
  } else if (isHighPartValue && isStrongDemand) {
    recommendedAction = "part_out";
  } else if (data.ageMonths !== null && data.ageMonths > 180 && !isHighPartValue) { // > 15 years
    recommendedAction = data.msrp && data.msrp > 800 ? "wholesale" : "scrap";
  } else {
    recommendedAction = "hold_for_parts";
  }

  return {
    score: Math.round(finalScore),
    recommendedAction,
    reasonCodes,
    factors
  };
}
