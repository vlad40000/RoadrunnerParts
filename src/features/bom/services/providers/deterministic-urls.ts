// Keep this module dependency-light: it is imported by API routes and UI helpers.
function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeModel(value: string | null | undefined) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

/**
 * Verified patterns from user research:
 * 
 * 1. AppliancePartsPros:
 * https://www.appliancepartspros.com/parts-for-{brand}-{model}.html
 * 
 * 2. Parts Dr:
 * Pattern 1: https://partsdr.com/appliance-parts/{model-lower}-{brand-lower}-{appliance}
 * Pattern 2: https://partsdr.com/appliance-models/{model-and-version-normalized}-{brand}-{appliance}/parts
 * 
 * 3. Bosch:
 * https://www.bosch-home.com/us/shop/spare-parts
 * 
 * 4. Encompass:
 * Regular: https://partstore.encompass.com/model/{MFG_CODE}{MODEL}
 * Diagram: https://encompass.com/Exploded-View-Assembly/{MFG_CODE}/{MODEL}
 * 
 * 5. GE Official:
 * Assembly: https://www.geapplianceparts.com/store/parts/assembly/{MODEL}
 * Specs: https://products.geappliances.com/appliance/gea-specs/{base-model}/parts
 * 
 * 6. PartSelect:
 * https://www.partselect.com/Models/{MODEL}/Manufacturer/{manufacturer_id}/
 * 
 * 7. LG Official:
 * Support: https://www.lg.com/us/support/product/lg-{MODEL}
 * Parts: https://lgparts.com/products/{MODEL}
 * 
 * 8. Samsung:
 * https://samsungparts.com/search?q={MODEL}
 */

export function buildAppliancePartsProsUrl(input: { brand: string; model: string }) {
  const brand = cleanText(input.brand).toLowerCase().replace(/\s+/g, "-");
  const model = normalizeModel(input.model).toLowerCase();
  return `https://www.appliancepartspros.com/parts-for-${brand}-${model}.html`;
}

export function buildPartsDrUrl(input: { brand: string; model: string; applianceType?: string | null }) {
  const brand = cleanText(input.brand).toLowerCase().replace(/\s+/g, "-");
  const model = normalizeModel(input.model).toLowerCase();
  const type = cleanText(input.applianceType ?? "appliance").toLowerCase().replace(/\s+/g, "-");
  
  // Primary Pattern: https://partsdr.com/appliance-parts/{model-lower}-{brand-lower}-{appliance}
  return `https://partsdr.com/appliance-parts/${model}-${brand}-${type}`;
}

export function buildEncompassUrl(input: { brand: string; model: string }) {
  // DEPRECATED: Use resolveEncompassBrandRoute from encompass-route-service.ts
  const brand = cleanText(input.brand).toUpperCase();
  const model = normalizeModel(input.model);
  
  const CORE_MAP: Record<string, string> = {
    'WHIRLPOOL': 'WHI',
    'SAMSUNG': 'SAM',
    'LG': 'LGE',
    'GE': 'GEN',
    'GENERAL ELECTRIC': 'GEN',
    'HOTPOINT': 'HOT',
    'FRIGIDAIRE': 'FRI',
    'ELECTROLUX': 'FRI',
    'MAYTAG': 'WHI',
    'KITCHENAID': 'WHI',
    'AMANA': 'WHI'
  };

  const mfgCode = CORE_MAP[brand] || null;
  if (!mfgCode) return null;
  
  return `https://encompass.com/Exploded-View-Assembly/${mfgCode}/${model}`;
}

/**
 * Builds a direct Exploded View Assembly URL using a template.
 * Pattern example: https://encompass.com/Exploded-View-Assembly/{abv}/{model}
 */
export function buildEncompassAssemblyUrl(input: { 
  abv: string; 
  targetBrand: string; 
  model: string; 
  pattern?: string | null 
}) {
  const pattern = input.pattern || 'https://encompass.com/Exploded-View-Assembly/{abv}/{model}';
  const model = normalizeModel(input.model);
  
  return pattern
    .replace('{abv}', input.abv)
    .replace('{target_brand}', input.targetBrand.replace(/\s+/g, '_'))
    .replace('{model}', model);
}

export function parseEncompassExplodedViewUrl(url: string) {
  const match = url.match(
    /^https?:\/\/(?:www\.)?(?:partstore\.)?encompass\.com\/Exploded-View-Assembly\/([^/]+)\/([^/]+)\/?([^/?#]*)?/i
  );

  if (!match) return null;

  const [, mfgCode, assemblyIdOrModel, rawModel] = match;

  return {
    source: "encompass",
    mfgCode: mfgCode.toUpperCase(),
    assemblyId: rawModel ? assemblyIdOrModel : null,
    model: (rawModel || assemblyIdOrModel || "").toUpperCase() || null,
    originalUrl: url
  };
}

export type EncompassCanonicalUrlSet = {
  brandAbv: string;
  modelOptionValue: string | null;
  model: string;
  explodedViewAssemblyUrl: string;
  partstoreAssemblyUrl: string;
  explodedViewSearchUrl?: string | null;
};

export function buildEncompassCanonicalUrlSet(input: {
  brandAbv: string;
  model: string;
  modelOptionValue?: string | null;
  explodedViewSearchUrl?: string | null;
}): EncompassCanonicalUrlSet {
  const brandAbv = cleanText(input.brandAbv).toUpperCase();
  const model = normalizeModel(input.model);
  const modelOptionValue = input.modelOptionValue ? cleanText(input.modelOptionValue) : null;
  const assemblyPath = modelOptionValue
    ? `${brandAbv}/${modelOptionValue}/${model}`
    : `${brandAbv}/${model}`;

  return {
    brandAbv,
    modelOptionValue,
    model,
    explodedViewAssemblyUrl: `https://encompass.com/Exploded-View-Assembly/${assemblyPath}`,
    partstoreAssemblyUrl: `https://partstore.encompass.com/Exploded-View-Assembly/${assemblyPath}`,
    explodedViewSearchUrl: input.explodedViewSearchUrl || null,
  };
}

export function buildEncompassCanonicalUrlSetFromAssemblyUrl(input: {
  url: string;
  explodedViewSearchUrl?: string | null;
}) {
  const parsed = parseEncompassExplodedViewUrl(input.url);
  if (!parsed?.mfgCode || !parsed.model) return null;

  return buildEncompassCanonicalUrlSet({
    brandAbv: parsed.mfgCode,
    modelOptionValue: parsed.assemblyId,
    model: parsed.model,
    explodedViewSearchUrl: input.explodedViewSearchUrl,
  });
}

export function buildGeOfficialAssemblyUrl(model: string) {
  const normalized = normalizeModel(model);
  return `https://www.geapplianceparts.com/store/parts/assembly/${normalized}`;
}

export function buildLgSupportUrl(model: string) {
  const normalized = normalizeModel(model);
  return `https://www.lg.com/us/support/product/lg-${normalized}`;
}

export function buildLgPartsUrl(model: string) {
  const normalized = normalizeModel(model).toLowerCase();
  return `https://lgparts.com/products/${normalized}`;
}

export function buildPartSelectUrl(input: { brand: string; model: string }) {
  const brand = cleanText(input.brand).toUpperCase();
  const model = normalizeModel(input.model);
  
  let mfgId = "";
  if (brand.includes("WHIRLPOOL")) mfgId = "1";
  else if (brand.includes("MAYTAG")) mfgId = "3";
  else if (brand.includes("KITCHENAID")) mfgId = "4";
  else if (brand.includes("AMANA")) mfgId = "5";
  else if (brand.includes("JENN-AIR")) mfgId = "6";
  else if (brand.includes("GE") || brand.includes("GENERAL ELECTRIC")) mfgId = "2";
  else if (brand.includes("LG")) mfgId = "15";
  else if (brand.includes("SAMSUNG")) mfgId = "13";
  
  if (!mfgId) return null;
  
  return `https://www.partselect.com/Models/${model}/Manufacturer/${mfgId}/`;
}

export function buildPartSelectSamsungUrl(input: { model: string; version?: string | null }) {
  const model = normalizeModel(input.model);
  const version = input.version ? input.version.replace(/\//g, "-").toUpperCase() : "AA-00";
  return `https://www.partselect.com/Models/${model}/MFGModelNumber/${version}/`;
}

export function buildSamsungPartsUrl(model: string) {
  const normalized = normalizeModel(model).toUpperCase();
  return `https://samsungparts.com/search?q=${normalized}`;
}

export function buildBoschSupportUrl() {
  return "https://www.bosch-home.com/us/owner-support/spare-parts";
}
