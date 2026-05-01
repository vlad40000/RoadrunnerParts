import "server-only";

export const SEEDED_SOURCE_TYPE_BY_PROVIDER: Record<string, "oem" | "distributor" | "distributor-merged-with-partselect"> = {
  "ge-official": "oem",
  "bosch-family": "oem",
  "frigidaire-family": "oem",
  "lg-family": "oem",
  "samsung-family": "oem",
  "whirlpool-family": "oem",

  "encompass-family": "distributor",
  "seeded-encompass": "distributor",
  "sears-partsdirect": "distributor",
  "fix.com": "distributor",
  "partselect.com": "distributor",
  "repairclinic-family": "distributor",
  "partsdr": "distributor",
  "appliancepartspros": "distributor",
  "appliance-parts-group": "distributor",
  "dey-appliance-parts": "distributor",
  "reliable-parts": "distributor",
  "coast-appliance-parts": "distributor",
  "deyparts": "distributor",
  "genuine-replacement-parts": "distributor",
  "tribles": "distributor",
  "midwest-appliance-parts": "distributor",
  "automatic-appliance-parts": "distributor",
  "seneca-river-trading": "distributor",
  "appliancefactoryparts": "distributor",
  "partsimple": "distributor",
  "partswarehouse": "distributor",
  "ereplacementparts": "distributor",
  "reliableparts": "distributor",
  "amresupply": "distributor"
};

export type ProviderClassification = 
  | "hybrid" 
  | "retail" 
  | "retail-oem" 
  | "retail-oem-distributor" 
  | "regional-distributor";

export const PROVIDER_CLASSIFICATION: Record<string, ProviderClassification> = {
  "encompass": "hybrid",
  "encompass-family": "hybrid",
  "seeded-encompass": "hybrid",
  "sears-partsdirect": "hybrid",
  "partsdr": "hybrid",
  "appliancepartspros": "hybrid",

  "fix.com": "retail",
  "partselect.com": "retail",
  "repairclinic-family": "retail",
  "appliancefactoryparts": "retail",
  "partswarehouse": "retail",
  "ereplacementparts": "retail",

  "appliance-parts-group": "retail-oem",
  "dey-appliance-parts": "retail-oem",
  "reliable-parts": "retail-oem-distributor",
  "coast-appliance-parts": "regional-distributor"
};

export const GROUNDING_TIERS = {
  tier_1: [
    "sears-partsdirect",
    "encompass",
    "partsdr",
    "appliancepartspros",
    "repairclinic-family",
    "partselect.com",
    "fix.com"
  ],
  tier_1_count_sources: [
    "encompass",
    "sears-partsdirect"
  ],
  tier_2: [
    "appliance-parts-group",
    "dey-appliance-parts",
    "reliable-parts",
    "coast-appliance-parts"
  ],
  tier_2_count_sources: [
    "partsdr",
    "appliancepartspros",
    "partselect.com",
    "fix.com"
  ],
  tier_3: [
    "appliancefactoryparts",
    "partswarehouse",
    "ereplacementparts"
  ],
  skip_for_grounding: []
};

/**
 * Router Rules:
 * 1. Use hybrid sources for model -> diagram/section -> BOM rows.
 * 2. Use retail sources for price, availability, substitutions, and gap-fill.
 * 3. Use regional/OEM-retail sources only after Tier 1 fails or for part-number validation.
 */

export function getSourceTypeForProvider(provider: string): "oem" | "distributor" | "distributor-merged-with-partselect" {
  return SEEDED_SOURCE_TYPE_BY_PROVIDER[provider] || "distributor";
}

export function getProviderClassification(provider: string): ProviderClassification | "unknown" {
  return PROVIDER_CLASSIFICATION[provider] || "unknown";
}

export const ENCOMPASS_EXPLODED_VIEW_CONFIG = {
  tier: 1,
  type: "hybrid",
  public_search_value: "high",
  url_construction: "semi-deterministic",
  model_url_deterministic: true,
  exploded_view_url_deterministic: false,
  requires_generated_assembly_id: true,
  minimum_expected_rows: 40,
  completion_signal: "all assembly sections processed"
};

export const GE_OFFICIAL_CONFIG = {
  type: "oem",
  best_entry: "https://www.geapplianceparts.com/store/parts/assembly/{MODEL}",
  backup_entry: "https://www.geappliances.com/ge/parts/search/",
  url_determinism: "high",
  model_key: "full_model",
  best_for: ["official diagrams", "assembly sections", "OEM part rows"],
  cache_resolved_urls: true
};

export const BOSCH_FAMILY_CONFIG = {
  type: "oem",
  best_entry: "https://www.bosch-home.com/us/owner-support/spare-parts",
  url_determinism: "low",
  model_key: "E-Nr",
  extra_keys: ["FD"],
  best_for: ["official model validation", "official parts diagrams when form resolves"],
  cache_resolved_urls: true
};

export const FRIGIDAIRE_FAMILY_CONFIG = {
  type: "oem-family",
  best_entry: "distributor-first resolution",
  url_determinism: "low",
  model_key: "full_model",
  family_brands: ["Frigidaire", "Electrolux", "White-Westinghouse", "Tappan", "Gibson", "Kelvinator"],
  primary_sources: ["partsdr", "partselect", "sears-partsdirect", "encompass-electrolux", "fix.com"],
  best_for: ["diagram retrieval via distributors", "OEM part validation"],
  cache_resolved_urls: true
};

export const LG_FAMILY_CONFIG = {
  type: "oem",
  best_entry: "https://www.lg.com/us/support/product/lg-{MODEL}",
  parts_entry: "LG authorized Encompass / LGParts / distributor pages",
  url_determinism: "medium_for_support_low_for_parts",
  model_key: "base_model_plus_optional_suffix",
  best_for: ["model validation", "manuals", "support docs", "parts via authorized distributor"],
  cache_resolved_urls: true
};

export const SAMSUNG_FAMILY_CONFIG = {
  type: "oem",
  best_entry: "samsungparts + variant-aware distributor pages",
  url_determinism: "medium",
  model_key: "base_model_plus_variant",
  variant_sensitive: true,
  primary_sources: ["samsungparts", "sears-partsdirect", "partsdr", "partselect", "fix.com"],
  best_for: ["variant-specific diagrams", "part rows", "model/version validation"],
  cache_resolved_urls: true
};
