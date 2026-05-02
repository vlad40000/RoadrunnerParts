/**
 * Encompass brand routing and model resolution logic.
 * Enables "Identity-First" UI by constructing direct URLs from model prefixes.
 */

export type EncompassBrandRoute = {
  brand: string;
  code: string;
  regularPrefix: string;
  explodedViewBaseUrl: string;
};

export const ENCOMPASS_BRAND_ROUTES: EncompassBrandRoute[] = [
  {
    brand: "Whirlpool",
    code: "whi",
    regularPrefix: "WHI",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/whi/Whirlpool",
  },
  {
    brand: "Maytag",
    code: "may",
    regularPrefix: "MAY",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/may/Maytag",
  },
  {
    brand: "LG",
    code: "lge",
    regularPrefix: "LGE",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/lge/LG",
  },
  {
    brand: "Samsung",
    code: "smg",
    regularPrefix: "SMG",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/smg/Samsung",
  },
  {
    brand: "Bosch",
    code: "bch",
    regularPrefix: "BCH",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/bch/Bosch",
  },
  {
    brand: "Electrolux",
    code: "fri",
    regularPrefix: "FRI",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/fri/Electrolux",
  },
  {
    brand: "Frigidaire",
    code: "fri",
    regularPrefix: "FRI",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/fri/Frigidaire",
  },
  {
    brand: "Haier",
    code: "hai",
    regularPrefix: "HAI",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/hai/Haier",
  },
  {
    brand: "Kenmore",
    code: "kmr",
    regularPrefix: "KMR",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/kmr/Kenmore",
  },
  {
    brand: "Sharp",
    code: "sha",
    regularPrefix: "SHA",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/sha/Sharp",
  },
  {
    brand: "Midea",
    code: "MID",
    regularPrefix: "MID",
    explodedViewBaseUrl: "https://encompass.com/Exploded-View-Search/MID/Midea",
  },
];

const MODEL_PREFIX_TO_BRAND: Record<string, string> = {
  // Maytag
  MED: "Maytag",
  MGD: "Maytag",
  MVW: "Maytag",
  MHW: "Maytag",
  MDB: "Maytag",

  // Whirlpool
  WTW: "Whirlpool",
  WED: "Whirlpool",
  WGD: "Whirlpool",
  WFW: "Whirlpool",
  WRS: "Whirlpool",
  WRF: "Whirlpool",

  // LG
  LFX: "LG",
  LRF: "LG",
  WM: "LG",
  DLE: "LG",
  DLG: "LG",

  // Samsung
  WF: "Samsung",
  WA: "Samsung",
  DV: "Samsung",
  RF: "Samsung",

  // Haier
  QG: "Haier",
  HB: "Haier",
  HR: "Haier",

  // Kenmore (by prefix)
  "110": "Kenmore",
  "790": "Kenmore",
  "665": "Kenmore",
  "106": "Kenmore",

  // Sharp
  "R-": "Sharp",
  KB: "Sharp",

  // Midea
  MD: "Midea",
  MR: "Midea",

  // Bosch
  SHE: "Bosch",
  SHX: "Bosch",
  SHP: "Bosch",
  SHV: "Bosch",
  B36: "Bosch",

  // Frigidaire/Electrolux
  FF: "Frigidaire",
  FG: "Frigidaire",
  FP: "Frigidaire",
  EI: "Electrolux",
  EW: "Electrolux",
};

export function normalizeModelNumber(model: string): string {
  return (model || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function resolveBrandFromModel(model: string): EncompassBrandRoute | null {
  const normalized = normalizeModelNumber(model);
  if (!normalized) return null;

  const sortedPrefixes = Object.keys(MODEL_PREFIX_TO_BRAND).sort(
    (a, b) => b.length - a.length
  );

  const matchedPrefix = sortedPrefixes.find((prefix) =>
    normalized.startsWith(prefix)
  );

  if (!matchedPrefix) return null;

  const brandName = MODEL_PREFIX_TO_BRAND[matchedPrefix];

  return (
    ENCOMPASS_BRAND_ROUTES.find((route) => route.brand === brandName) ?? null
  );
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
    regularModelUrl: `https://encompass.com/model/${route.regularPrefix}${normalizedModel}`,
    explodedViewUrl: route.explodedViewBaseUrl,
    error: null,
  };
}
