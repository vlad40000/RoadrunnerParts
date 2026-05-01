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
  Electrolux: {
    canonicalBrand: "Electrolux",
    genericRoutes: [
      { label: "Electrolux parts category", url: "https://www.guaranteedparts.com/category/electrolux.html" },
    ],
    fallbackRoutes: [
      { label: "RepairClinic brand search", url: "https://www.repairclinic.com/Shop-For-Parts" },
    ],
  },
  Whirlpool: {
    canonicalBrand: "Whirlpool",
    routes: {
      washer: [{ label: "Whirlpool washer parts", url: "https://www.whirlpoolparts.com/Shop-For-Parts/a11/Washing-Machine-Parts" }],
      dryer: [{ label: "Whirlpool dryer parts", url: "https://www.whirlpoolparts.com/Shop-For-Parts/a8/Dryer-Parts" }],
      washer_dryer_combo: [{ label: "Whirlpool combo parts", url: "https://www.whirlpoolparts.com/Shop-For-Parts/a17/Washer-Dryer-Combo-Parts" }],
      refrigerator: [{ label: "Whirlpool refrigerator parts", url: "https://www.whirlpoolparts.com/Shop-For-Parts/a4/Refrigerator-Parts" }],
    },
    fallbackRoutes: [
      { label: "RepairClinic Whirlpool-family search", url: "https://www.repairclinic.com/Shop-For-Parts" },
    ],
  },
  GE: {
    canonicalBrand: "GE",
    genericRoutes: [{ label: "GE parts search", url: "https://www.geappliances.com/ge/parts/search/" }],
  },
  Cafe: {
    canonicalBrand: "Cafe",
    genericRoutes: [{ label: "Cafe replacement parts", url: "https://www.geapplianceparts.com/cafe-replacement-parts.html" }],
  },
  Monogram: {
    canonicalBrand: "Monogram",
    genericRoutes: [{ label: "Monogram replacement parts", url: "https://www.geapplianceparts.com/monogram-replacement-parts.html" }],
  },
  Haier: {
    canonicalBrand: "Haier",
    genericRoutes: [{ label: "Haier replacement parts", url: "https://www.geapplianceparts.com/haier-replacement-parts.html" }],
  },
  Hotpoint: {
    canonicalBrand: "Hotpoint",
    genericRoutes: [{ label: "Hotpoint replacement parts", url: "https://www.geapplianceparts.com/hotpoint-replacement-parts.html" }],
  },
  Bosch: {
    canonicalBrand: "Bosch",
    routes: {
      dishwasher: [{ label: "Bosch dishwasher parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/dishwasher" }],
      refrigerator: [{ label: "Bosch refrigerator parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/refrigerator" }],
      range: [{ label: "Bosch range parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/electro-cooker" }],
      cooktop: [{ label: "Bosch cooktop parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/ceramic-hob" }],
      washer: [{ label: "Bosch washer parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/washing-machines" }],
      dryer: [{ label: "Bosch dryer parts", url: "https://www.bosch-home.com/us/owner-support/spare-parts/dryer" }],
    },
  },
  Samsung: {
    canonicalBrand: "Samsung",
    routes: {
      dryer: [{ label: "Samsung dryer parts", url: "https://samsungpartsusa.com/collections/dryer-parts" }],
      washer: [
        { label: "Samsung washer parts", url: "https://samsungpartsusa.com/collections/washer-parts" },
        { label: "Samsung washing machine parts", url: "https://samsungpartsusa.com/collections/washing-machine-parts" },
      ],
      refrigerator: [{ label: "Samsung refrigerator parts", url: "https://samsungpartsusa.com/collections/refrigerator-parts" }],
    },
  },
  LG: {
    canonicalBrand: "LG",
    routes: {
      dishwasher: [{ label: "LG dishwasher parts", url: "https://lgparts.com/collections/dishwasher-parts" }],
      range: [{ label: "LG oven/range parts", url: "https://lgparts.com/collections/oven-range-parts" }],
      oven: [{ label: "LG oven/range parts", url: "https://lgparts.com/collections/oven-range-parts" }],
      dryer: [{ label: "LG dryer parts", url: "https://lgparts.com/collections/dryer-parts" }],
      washer: [{ label: "LG washer parts", url: "https://lgparts.com/collections/washer-parts" }],
      refrigerator: [{ label: "LG refrigerator parts", url: "https://lgparts.com/collections/refrigerator-parts" }],
    },
  },
  Frigidaire: {
    canonicalBrand: "Frigidaire",
    routes: {
      refrigerator: [{ label: "Frigidaire refrigerator parts", url: "https://www.frigidaireapplianceparts.com/Shop-For-Parts/a4w2/Refrigerator-Parts" }],
      range: [{ label: "Frigidaire range/stove/oven parts", url: "https://www.frigidaireapplianceparts.com/Shop-For-Parts/a13w2/Range-Stove-Oven-Parts" }],
      oven: [{ label: "Frigidaire range/stove/oven parts", url: "https://www.frigidaireapplianceparts.com/Shop-For-Parts/a13w2/Range-Stove-Oven-Parts" }],
      dryer: [{ label: "Frigidaire dryer parts", url: "https://www.frigidaireapplianceparts.com/Shop-For-Parts/a8w2/Dryer-Parts" }],
      washer: [{ label: "Frigidaire washer parts", url: "https://www.frigidaireapplianceparts.com/Shop-For-Parts/a11w2/Washing-Machine-Parts" }],
    },
  },
  Amana: {
    canonicalBrand: "Amana",
    routes: {
      washer: [{ label: "Amana washer parts", url: "https://www.amanaparts.com/Shop-For-Parts/a11b1/Amana-Washing-Machine-Parts" }],
      dryer: [{ label: "Amana dryer parts", url: "https://www.amanaparts.com/Shop-For-Parts/a8b1/Amana-Dryer-Parts" }],
      refrigerator: [{ label: "Amana refrigerator parts", url: "https://www.amanaparts.com/Shop-For-Parts/a4b1/Amana-Refrigerator-Parts" }],
    },
  },
  KitchenAid: {
    canonicalBrand: "KitchenAid",
    routes: {
      refrigerator: [{ label: "KitchenAid refrigerator parts", url: "https://www.kitchenaidparts.com/Shop-For-Parts/a4b121/Kitchenaid-Refrigerator-Parts" }],
    },
  },
  Maytag: {
    canonicalBrand: "Maytag",
    routes: {
      washer: [{ label: "Maytag washer parts", url: "https://www.maytagreplacementparts.com/Shop-For-Parts/a11b4/Maytag-Washing-Machine-Parts" }],
      dryer: [{ label: "Maytag dryer parts", url: "https://www.maytagreplacementparts.com/Shop-For-Parts/a8b4/Maytag-Dryer-Parts" }],
      washer_dryer_combo: [{ label: "Maytag combo parts", url: "https://www.maytagreplacementparts.com/Shop-For-Parts/a17b4/Maytag-Washer-Dryer-Combo-Parts" }],
      refrigerator: [{ label: "Maytag refrigerator parts", url: "https://www.maytagreplacementparts.com/Shop-For-Parts/a4b4/Maytag-Refrigerator-Parts" }],
    },
  },
  Kenmore: {
    canonicalBrand: "Kenmore",
    genericRoutes: [{ label: "Kenmore brand parts", url: "https://www.searspartsdirect.com/brand/0582/kenmore-parts" }],
    fallbackRoutes: [{ label: "RepairClinic Roper/Kenmore-family search", url: "https://www.repairclinic.com/Shop-For-Parts?searchwithin=roper" }],
  },
  Roper: {
    canonicalBrand: "Roper",
    genericRoutes: [{ label: "RepairClinic Roper search", url: "https://www.repairclinic.com/Shop-For-Parts?searchwithin=roper" }],
  },
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
  const modelNumber = String(input.modelNumber || "").trim();

  let oemBrand: string | null = null;
  if (brand === "Kenmore") {
    oemBrand = resolveKenmoreOem(modelNumber);
  }

  const primaryBrand = oemBrand || brand;
  const primary = PARTS_SOURCE_REGISTRY[primaryBrand];
  const secondary = brand !== primaryBrand ? PARTS_SOURCE_REGISTRY[brand] : null;

  const typeRoutes = primary?.routes?.[applianceType] || [];
  const genericRoutes = primary?.genericRoutes || [];
  const fallbackRoutes = [
    ...(secondary?.genericRoutes || []),
    ...(primary?.fallbackRoutes || []),
    ...(secondary?.fallbackRoutes || []),
  ];

  return {
    requestedBrand: brand,
    resolvedBrand: primaryBrand,
    applianceType,
    primaryRoutes: [...typeRoutes, ...genericRoutes],
    fallbackRoutes,
  };
}
