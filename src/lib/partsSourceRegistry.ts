import { resolveBrandSourceGate } from "@/features/bom/registry/brand-source-gate";

export type ApplianceType =
  | "washer"
  | "dryer"
  | "washer_dryer_combo"
  | "refrigerator"
  | "dishwasher"
  | "range"
  | "cooktop"
  | "oven"
  | "unknown";

export type PartsSourceRoute = {
  label: string;
  url: string;
};

export type BrandSourceConfig = {
  canonicalBrand: string;
  routes?: Partial<Record<ApplianceType, PartsSourceRoute[]>>;
  genericRoutes?: PartsSourceRoute[];
  fallbackRoutes?: PartsSourceRoute[];
};

export const APPLIANCE_TYPE_ALIASES: Record<string, ApplianceType> = {
  WASHER: "washer",
  "WASHING MACHINE": "washer",
  "CLOTHES WASHER": "washer",
  DRYER: "dryer",
  "CLOTHES DRYER": "dryer",
  "WASHER/DRYER COMBO": "washer_dryer_combo",
  "WASHER DRYER COMBO": "washer_dryer_combo",
  COMBO: "washer_dryer_combo",
  REFRIGERATOR: "refrigerator",
  FRIDGE: "refrigerator",
  DISHWASHER: "dishwasher",
  RANGE: "range",
  STOVE: "range",
  "RANGE/STOVE": "range",
  "ELECTRO COOKER": "range",
  COOKTOP: "cooktop",
  HOB: "cooktop",
  "CERAMIC HOB": "cooktop",
  OVEN: "oven",
};

export const BRAND_ALIASES: Record<string, string> = {
  "GE": "GE",
  "GE PROFILE": "GE",
  "PROFILE": "GE",
  "CAFÉ": "Cafe",
  "CAFE": "Cafe",
  "MONOGRAM": "Monogram",
  "HOTPOINT": "Hotpoint",
  "HAIER": "Haier",
  "ELECTROLUX": "Electrolux",
  "FRIGIDAIRE": "Frigidaire",
  "BOSCH": "Bosch",
  "SAMSUNG": "Samsung",
  "LG": "LG",
  "WHIRLPOOL": "Whirlpool",
  "MAYTAG": "Maytag",
  "AMANA": "Amana",
  "KITCHENAID": "KitchenAid",
  "ROPER": "Roper",
  "KENMORE": "Kenmore",
};

export const KENMORE_OEM_MAP: Record<string, string> = {
  "106": "Whirlpool",
  "110": "Whirlpool",
  "665": "Whirlpool",
  "587": "Frigidaire",
  "253": "Frigidaire",
  "417": "Frigidaire",
  "795": "LG",
  "796": "LG",
  "401": "Samsung",
  "592": "Samsung",
  "363": "GE",
  "362": "GE",
  "911": "GE",
  "101": "Frigidaire",
  "596": "Whirlpool",
  "790": "Frigidaire",
};

export const PARTS_SOURCE_REGISTRY: Record<string, BrandSourceConfig> = {
  // Legacy registry now used only for brand normalization and non-BOM fallback
  Electrolux: { canonicalBrand: "Electrolux" },
  Whirlpool: { canonicalBrand: "Whirlpool" },
  GE: { canonicalBrand: "GE" },
  Cafe: { canonicalBrand: "Cafe" },
  Monogram: { canonicalBrand: "Monogram" },
  Haier: { canonicalBrand: "Haier" },
  Hotpoint: { canonicalBrand: "Hotpoint" },
  Bosch: { canonicalBrand: "Bosch" },
  Samsung: { canonicalBrand: "Samsung" },
  LG: { canonicalBrand: "LG" },
  Frigidaire: { canonicalBrand: "Frigidaire" },
  Amana: { canonicalBrand: "Amana" },
  KitchenAid: { canonicalBrand: "KitchenAid" },
  Maytag: { canonicalBrand: "Maytag" },
  Kenmore: { canonicalBrand: "Kenmore" },
  Roper: { canonicalBrand: "Roper" },
};

const SOURCE_TEMPLATES: Record<string, (model: string) => string> = {
  encompass: (m) => `https://encompass.com/model/${m}`,
  "sears-partsdirect": (m) => `https://www.searspartsdirect.com/model/${m}`,
  partsdr: (m) => `https://partsdr.com/search?q=${m}`,
  appliancepartspros: (m) => `https://www.appliancepartspros.com/search.aspx?q=${m}`,
  "repairclinic-family": (m) => `https://www.repairclinic.com/Shop-For-Parts?SearchText=${m}`,
  "partselect.com": (m) => `https://www.partselect.com/Models/${m}/`,
  "fix.com": (m) => `https://www.fix.com/models/${m}/`,
};

export function normalizeApplianceType(raw: string | null | undefined): ApplianceType {
  const key = String(raw || "").trim().toUpperCase();
  return APPLIANCE_TYPE_ALIASES[key] || "unknown";
}

export function normalizeBrand(raw: string | null | undefined): string {
  const key = String(raw || "").trim().toUpperCase();
  return BRAND_ALIASES[key] || String(raw || "").trim();
}

export function resolveKenmoreOem(modelNumber: string): string | null {
  const prefix = String(modelNumber || "").split(".")[0].trim();
  return KENMORE_OEM_MAP[prefix] || null;
}

export function resolvePartsSources(input: {
  brand: string;
  applianceType: string;
  modelNumber?: string;
}) {
  const brand = normalizeBrand(input.brand);
  const applianceType = normalizeApplianceType(input.applianceType);
  const modelNumber = String(input.modelNumber || "").trim().toUpperCase();

  const gate = resolveBrandSourceGate({
    brand: input.brand,
    resolvedBrand: brand
  });

  const primaryRoutes: PartsSourceRoute[] = gate.primarySources.map(key => ({
    label: `${key} (${modelNumber})`,
    url: SOURCE_TEMPLATES[key]?.(modelNumber) || `https://${key}.com/search?q=${modelNumber}`
  }));

  const secondaryRoutes: PartsSourceRoute[] = gate.secondarySources.map(key => ({
    label: `${key} (${modelNumber})`,
    url: SOURCE_TEMPLATES[key]?.(modelNumber) || `https://${key}.com/search?q=${modelNumber}`
  }));

  return {
    requestedBrand: brand,
    resolvedBrand: gate.brandFamily,
    applianceType,
    primaryRoutes,
    secondaryRoutes,
    forbiddenSources: gate.forbiddenSources,
    forbiddenDomains: gate.forbiddenDomains
  };
}
