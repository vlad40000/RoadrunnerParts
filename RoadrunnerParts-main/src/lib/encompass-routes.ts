/**
 * Encompass brand routing and model resolution logic.
 * Provides deterministic direct URLs for the UI and OCR follow-up flows.
 */

export type EncompassBrandRoute = {
  brand: string;
  code: string;
  regularPrefix: string;
  explodedViewBaseUrl: string;
  isAlias?: boolean;
};

export const ENCOMPASS_BRAND_ROUTES: EncompassBrandRoute[] = [
  { "brand": "Acros", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Affresh", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Amana", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Aeon Air", "code": "anr", "regularPrefix": "ANR", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/anr/Aeon_Air", "isAlias": false },
  { "brand": "Avanti", "code": "ava", "regularPrefix": "AVA", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/AVA/Avanti", "isAlias": false },
  { "brand": "Bauknecht", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Bertazzoni", "code": "brt", "regularPrefix": "BRT", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/brt/Bertazzoni", "isAlias": false },
  { "brand": "Beko", "code": "bek", "regularPrefix": "BEK", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/bek/Beko", "isAlias": false },
  { "brand": "Blomberg", "code": "blm", "regularPrefix": "BLM", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/blm/Blomberg", "isAlias": false },
  { "brand": "Bosch", "code": "bch", "regularPrefix": "BCH", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/bch/Bosch", "isAlias": false },
  { "brand": "Brastemp", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Breville", "code": "bre", "regularPrefix": "BRE", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/bre/Breville", "isAlias": false },
  { "brand": "Consul", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Criterion", "code": "cri", "regularPrefix": "CRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/cri/Criterion", "isAlias": false },
  { "brand": "Dacor", "code": "dac", "regularPrefix": "DAC", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/dac/Dacor", "isAlias": false },
  { "brand": "Danby", "code": "dby", "regularPrefix": "DBY", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/dby/Danby", "isAlias": false },
  { "brand": "De'Longhi", "code": "dei", "regularPrefix": "DEI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/dei/De%27Longhi", "isAlias": false },
  { "brand": "Elica", "code": "eli", "regularPrefix": "ELI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/eli/Elica", "isAlias": false },
  { "brand": "Electrolux", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": false },
  { "brand": "Element", "code": "ele", "regularPrefix": "ELE", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/ele/Element", "isAlias": false },
  { "brand": "Fisher Paykel", "code": "fap", "regularPrefix": "FAP", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fap/Fisher_Paykel", "isAlias": false },
  { "brand": "Frigidaire", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Gaggenau", "code": "bch", "regularPrefix": "BCH", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/bch/Bosch", "isAlias": true },
  { "brand": "GE", "code": "hot", "regularPrefix": "HOT", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/hot/HotPoint", "isAlias": true },
  { "brand": "Gibson", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Haier", "code": "hai", "regularPrefix": "HAI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/hai/Haier", "isAlias": false },
  { "brand": "Hestan", "code": "hes", "regularPrefix": "HES", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/HES/Hestan", "isAlias": false },
  { "brand": "Hotpoint", "code": "hot", "regularPrefix": "HOT", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/hot/HotPoint", "isAlias": true },
  { "brand": "IKEA", "code": "ikea", "regularPrefix": "IKEA", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/ikea/IKEA", "isAlias": false },
  { "brand": "Indesit", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Jennair", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "Kelvinator", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Kenmore", "code": "kmr", "regularPrefix": "KMR", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/kmr/Kenmore", "isAlias": false },
  { "brand": "KitchenAid", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true },
  { "brand": "LG", "code": "lge", "regularPrefix": "LGE", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/lge/LG", "isAlias": false },
  { "brand": "Liebherr", "code": "lie", "regularPrefix": "LIE", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/lie/Liebherr", "isAlias": false },
  { "brand": "Magic Chef", "code": "mac", "regularPrefix": "MAC", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/mac/MagicChef", "isAlias": false },
  { "brand": "Maytag", "code": "may", "regularPrefix": "MAY", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/may/Maytag", "isAlias": false },
  { "brand": "Middleby", "code": "mby", "regularPrefix": "MBY", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/mby/Middleby", "isAlias": false },
  { "brand": "Midea", "code": "mid", "regularPrefix": "MID", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/MID/Midea", "isAlias": false },
  { "brand": "Miele", "code": "mie", "regularPrefix": "MIE", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/MIE/Miele", "isAlias": false },
  { "brand": "Monogram", "code": "hot", "regularPrefix": "HOT", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/hot/HotPoint", "isAlias": true },
  { "brand": "Philco", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Samsung", "code": "smg", "regularPrefix": "SMG", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/smg/Samsung", "isAlias": false },
  { "brand": "Sharp", "code": "sha", "regularPrefix": "SHA", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/sha/Sharp", "isAlias": false },
  { "brand": "Silhouette", "code": "sil", "regularPrefix": "SIL", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/sil/Silhouette", "isAlias": false },
  { "brand": "Smeg", "code": "sgg", "regularPrefix": "SGG", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/sgg/Smeg", "isAlias": false },
  { "brand": "Speed Queen", "code": "spq", "regularPrefix": "SPQ", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/SPQ/Speed-Queen", "isAlias": false },
  { "brand": "Tappan", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Thermador", "code": "bch", "regularPrefix": "BCH", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/bch/Bosch", "isAlias": true },
  { "brand": "Viking", "code": "vik", "regularPrefix": "VIK", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/vik/Viking", "isAlias": false },
  { "brand": "Vulcan", "code": "vul", "regularPrefix": "VUL", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/vul/Vulcan", "isAlias": false },
  { "brand": "Whirlpool", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": false },
  { "brand": "White-Westinghouse", "code": "fri", "regularPrefix": "FRI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/fri/Electrolux", "isAlias": true },
  { "brand": "Yummly", "code": "whi", "regularPrefix": "WHI", "explodedViewBaseUrl": "https://encompass.com/Exploded-View-Search/whi/Whirlpool", "isAlias": true }
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
  HT: "Hotpoint",
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

/**
 * Builds Encompass URLs following the Core Pipeline Stage 3 rules.
 */
export function buildEncompassUrls(model: string, assemblyId?: string) {
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

  const brandCodeUpper = route.regularPrefix;
  const brandCodeLower = route.code;

  // A. Model page URL
  const regularModelUrl = `https://encompass.com/model/${brandCodeUpper}${normalizedModel}`;

  // B. Exploded view / assembly URL
  // If assemblyId is provided, construct the specific assembly URL
  // Otherwise, fallback to the search URL or a template
  const explodedViewUrl = assemblyId 
    ? `https://encompass.com/Exploded-View-Assembly/${brandCodeUpper}/${assemblyId}/${normalizedModel}`
    : route.explodedViewBaseUrl;

  return {
    model: normalizedModel,
    brand: route.brand,
    brandCode: brandCodeLower,
    regularModelUrl,
    explodedViewUrl,
    error: null,
  };
}
