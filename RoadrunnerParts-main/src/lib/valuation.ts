
export type BrandTier = "mainstream" | "premium" | "value";
export type ApplianceCondition = "excellent" | "good" | "fair" | "poor";

export const BRAND_TABLE: Record<BrandTier, { salvage_floor_bps: number; depr_bps_per_month: number }> = {
  mainstream: { salvage_floor_bps: 900, depr_bps_per_month: 180 },
  premium: { salvage_floor_bps: 1200, depr_bps_per_month: 140 },
  value: { salvage_floor_bps: 700, depr_bps_per_month: 220 },
};

export const TYPE_SALVAGE_ADD_BPS: Record<string, number> = {
  "Refrigerator": 250,
  "Washer": 200,
  "Dryer": 125,
  "Dishwasher": 100,
  "Range": 175,
  "Stove": 175,
  "Oven": 175,
};

export const CONDITION_MULTIPLIER_BPS: Record<ApplianceCondition, number> = {
  excellent: 10000,
  good: 9200,
  fair: 8200,
  poor: 7000,
};

export const BRAND_TIER_MAPPING: Record<string, BrandTier> = {
  "Whirlpool": "mainstream",
  "GE": "mainstream",
  "LG": "mainstream",
  "Samsung": "mainstream",
  "Maytag": "mainstream",
  "Kenmore": "mainstream",
  "Bosch": "premium",
  "KitchenAid": "premium",
  "Viking": "premium",
  "Sub-Zero": "premium",
  "Miele": "premium",
  "Amana": "value",
  "Frigidaire": "mainstream", // Frigidaire is mostly mainstream but has value lines
  "Hotpoint": "value",
  "Roper": "value",
  "Admiral": "value"
};

export interface ValuationResult {
  currentMarketValue: number;
  fairValue: number;
  salvageFloor: number;
  deprecatedValue: number;
  ageMonths: number;
}

export function computeCurrentMarketValue(
  msrp: number,
  manufactureYear: number | null,
  manufactureMonth: number | null,
  applianceType: string,
  brandFamily: string,
  condition: ApplianceCondition = "good"
): ValuationResult {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  let ageMonths = 0;
  if (manufactureYear) {
    const manufactureDate = new Date(manufactureYear, (manufactureMonth || 1) - 1);
    const currentDate = new Date();
    ageMonths = (currentDate.getFullYear() - manufactureDate.getFullYear()) * 12 + (currentDate.getMonth() - manufactureDate.getMonth());
  }
  ageMonths = Math.max(0, ageMonths);

  const brandTier = BRAND_TIER_MAPPING[brandFamily] || "mainstream";
  const brandRow = BRAND_TABLE[brandTier];
  const conditionBps = CONDITION_MULTIPLIER_BPS[condition];
  
  // Find salvage add bps
  let salvageAddBps = 0;
  for (const [type, bps] of Object.entries(TYPE_SALVAGE_ADD_BPS)) {
    if (applianceType.toLowerCase().includes(type.toLowerCase())) {
      salvageAddBps = bps;
      break;
    }
  }

  const p0Cents = Math.round(msrp * 100);
  
  // Salvage Floor calculation
  const salvageFloorEffBps = Math.max(300, Math.min(3500, brandRow.salvage_floor_bps + salvageAddBps));
  const salvageFloorCents = Math.round(p0Cents * (salvageFloorEffBps / 10000));

  // Depreciation calculation
  const ageEffMonths = ageMonths <= 6 ? Math.max(0, ageMonths + 1) : ageMonths;
  const baseDeprBps = Math.max(0, Math.min(9000, ageEffMonths * brandRow.depr_bps_per_month));
  
  const postAgeCents = Math.round(p0Cents * ((10000 - baseDeprBps) / 10000));
  const marketAdjCents = Math.round(postAgeCents * (conditionBps / 10000));
  
  const fairValueCents = Math.max(salvageFloorCents, marketAdjCents);
  
  return {
    currentMarketValue: fairValueCents / 100,
    fairValue: fairValueCents / 100,
    salvageFloor: salvageFloorCents / 100,
    deprecatedValue: marketAdjCents / 100,
    ageMonths: ageMonths
  };
}
