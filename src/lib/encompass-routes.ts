/**
 * Encompass brand routing and model resolution logic.
 * Provides deterministic direct URLs for the UI and OCR follow-up flows.
 */

export type EncompassBrandRoute = {
  brand: string;
  code: string;
  regularPrefix: string;
};

export const ENCOMPASS_BRAND_ROUTES: EncompassBrandRoute[] = [
  {
    brand: "Whirlpool",
    code: "whi",
    regularPrefix: "WHI",
  },
  {
    brand: "Maytag",
    code: "may",
    regularPrefix: "WHI",
  },
  {
    brand: "LG",
    code: "lge",
    regularPrefix: "LGE",
  },
  {
    brand: "Samsung",
    code: "sam",
    regularPrefix: "SAM",
  },
  {
    brand: "Bosch",
    code: "bch",
    regularPrefix: "BCH",
  },
  {
    brand: "Electrolux",
    code: "fri",
    regularPrefix: "FRI",
  },
  {
    brand: "Frigidaire",
    code: "fri",
    regularPrefix: "FRI",
  },
  {
    brand: "Haier",
    code: "hai",
    regularPrefix: "HAI",
  },
  {
    brand: "Kenmore",
    code: "kmr",
    regularPrefix: "KMR",
  },
  {
    brand: "Sharp",
    code: "sha",
    regularPrefix: "SHA",
  },
  {
    brand: "Midea",
    code: "mid",
    regularPrefix: "MID",
  },
];

const MODEL_PREFIX_TO_BRAND: Record<string, string> = {
  MED: "Maytag",
  MGD: "Maytag",
  MVW: "Maytag",
  MHW: "Maytag",
  MDB: "Maytag",
  WTW: "Whirlpool",
  WED: "Whirlpool",
  WGD: "Whirlpool",
  WFW: "Whirlpool",
  WRS: "Whirlpool",
  WRF: "Whirlpool",
  LFX: "LG",
  LRF: "LG",
  WM: "LG",
  DLE: "LG",
  DLG: "LG",
  WF: "Samsung",
  WA: "Samsung",
  DV: "Samsung",
  RF: "Samsung",
  QG: "Haier",
  HB: "Haier",
  HR: "Haier",
  "110": "Kenmore",
  "790": "Kenmore",
  "665": "Kenmore",
  "106": "Kenmore",
  "R-": "Sharp",
  KB: "Sharp",
  MD: "Midea",
  MR: "Midea",
  SHE: "Bosch",
  SHX: "Bosch",
  SHP: "Bosch",
  SHV: "Bosch",
  B36: "Bosch",
  FF: "Frigidaire",
  FG: "Frigidaire",
  FP: "Frigidaire",
  EI: "Electrolux",
  EW: "Electrolux",
};

export function normalizeModelNumber(model: string) {
  return String(model || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function resolveBrandFromModel(model: string): EncompassBrandRoute | null {
  const normalized = normalizeModelNumber(model);
  if (!normalized) return null;

  const sortedPrefixes = Object.keys(MODEL_PREFIX_TO_BRAND).sort(
    (a, b) => b.length - a.length,
  );
  const matchedPrefix = sortedPrefixes.find((prefix) => normalized.startsWith(prefix));
  if (!matchedPrefix) return null;

  const brandName = MODEL_PREFIX_TO_BRAND[matchedPrefix];

  return ENCOMPASS_BRAND_ROUTES.find((route) => route.brand === brandName) ?? null;
}

export function buildEncompassUrls(model: string) {
  const normalizedModel = normalizeModelNumber(model);
  const route = resolveBrandFromModel(normalizedModel);

  if (!route) {
    return {
      model: normalizedModel,
      brand: null,
      regularModelUrl: "",
      explodedViewUrl: "",
      error: normalizedModel ? "Brand route could not be resolved from model prefix." : null,
    };
  }

  return {
    model: normalizedModel,
    brand: route.brand,
    regularModelUrl: `https://partstore.encompass.com/model/${route.regularPrefix}${normalizedModel}`,
    regularModelUrlAlt: `https://encompass.com/model/${route.regularPrefix}${normalizedModel}`,
    explodedViewUrl: `https://encompass.com/Exploded-View-Assembly/${route.regularPrefix}/${normalizedModel}`,
    error: null,
  };
}
