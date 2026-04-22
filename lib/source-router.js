/**
 * Worker 3: Source Router
 * Maps brand families to their respective OEM and fallback sources.
 */

export const BRAND_FAMILY_MAP = {
  ge: { family: "GE", primary: ["oem_ge", "fix", "sears"] },
  hotpoint: { family: "GE", primary: ["oem_ge", "fix", "sears"] },
  cafe: { family: "GE", primary: ["oem_ge", "fix", "sears"] },
  monogram: { family: "GE", primary: ["oem_ge", "fix", "sears"] },
  haier: { family: "GE", primary: ["oem_ge", "fix", "sears"] },

  whirlpool: { family: "Whirlpool", primary: ["oem_whirlpool", "fix", "sears", "encompass"] },
  maytag: { family: "Whirlpool", primary: ["oem_whirlpool", "fix", "sears", "encompass"] },
  amana: { family: "Whirlpool", primary: ["oem_whirlpool", "fix", "sears", "encompass"] },
  kitchenaid: { family: "Whirlpool", primary: ["oem_whirlpool", "fix", "sears", "encompass"] },
  jennair: { family: "Whirlpool", primary: ["oem_whirlpool", "fix", "sears", "encompass"] },

  frigidaire: { family: "Electrolux", primary: ["fix", "sears", "encompass"] },
  electrolux: { family: "Electrolux", primary: ["fix", "sears", "encompass"] },

  lg: { family: "LG", primary: ["fix", "sears", "encompass"] },
  samsung: { family: "Samsung", primary: ["fix", "sears", "encompass"] },
  bosch: { family: "BSH", primary: ["fix", "sears", "encompass"] },
  thermador: { family: "BSH", primary: ["fix", "sears", "encompass"] },
  gaggenau: { family: "BSH", primary: ["fix", "sears", "encompass"] },
};

const FAMILY_ALIAS_MAP = {
  ge: BRAND_FAMILY_MAP.ge,
  whirlpool: BRAND_FAMILY_MAP.whirlpool,
  electrolux: BRAND_FAMILY_MAP.frigidaire,
  frigidaire: BRAND_FAMILY_MAP.frigidaire,
  lg: BRAND_FAMILY_MAP.lg,
  samsung: BRAND_FAMILY_MAP.samsung,
  bsh: BRAND_FAMILY_MAP.bosch,
};

function normalizeLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function routeSource(identity) {
  const familyKey = normalizeLookupKey(identity.manufacturer_family);
  const brandKey = normalizeLookupKey(identity.brand_normalized || identity.brand_raw);

  const config =
    BRAND_FAMILY_MAP[brandKey] ||
    FAMILY_ALIAS_MAP[familyKey] ||
    BRAND_FAMILY_MAP[familyKey] ||
    { family: 'Unknown', primary: ['fix', 'sears'] };

  return {
    primary_source: config.primary[0],
    fallback_sources: config.primary.slice(1),
    requires_revision_resolution: ['ge', 'whirlpool'].includes(familyKey),
    requires_serial_split_check: true,
  };
}
