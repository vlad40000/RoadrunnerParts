import "server-only";
import { normalizeModel, cleanText } from "./utils";

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
 * https://encompass.com/model/{MFG_CODE}{MODEL}
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
  
  // Pattern 1 is the most common according to user
  return `https://partsdr.com/appliance-parts/${model}-${brand}-${type}`;
}

export function buildEncompassUrl(input: { brand: string; model: string }) {
  const brand = cleanText(input.brand).toUpperCase();
  const model = normalizeModel(input.model);
  
  let mfgCode = "";
  if (brand.includes("GE") || brand.includes("GENERAL ELECTRIC") || brand.includes("HOTPOINT") || brand.includes("HAIER")) {
    mfgCode = "HOT";
  } else if (brand.includes("WHIRLPOOL") || brand.includes("MAYTAG") || brand.includes("KITCHENAID") || brand.includes("AMANA") || brand.includes("JENN-AIR")) {
    mfgCode = "WHI";
  } else if (brand.includes("SAMSUNG")) {
    mfgCode = "SAM";
  } else if (brand.includes("LG")) {
    mfgCode = "ZEN"; // LG often uses ZEN in Encompass for some reason, or LGE. Checking verified lists.
  }
  
  if (!mfgCode) return null;
  
  return `https://encompass.com/model/${mfgCode}${model}`;
}

export function parseEncompassExplodedViewUrl(url: string) {
  const match = url.match(
    /^https?:\/\/(?:www\.)?(?:partstore\.)?encompass\.com\/Exploded-View-Assembly\/([^/]+)\/([^/]+)\/?([^/?#]*)?/i
  );

  if (!match) return null;

  const [, mfgCode, assemblyId, rawModel] = match;

  return {
    source: "encompass",
    mfgCode: mfgCode.toUpperCase(),
    assemblyId,
    model: rawModel ? rawModel.toUpperCase() : null,
    originalUrl: url
  };
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
