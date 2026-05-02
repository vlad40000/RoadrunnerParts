import "server-only";

export const SOURCE_POLICY = {
  mode: "distributor_only",
  oemSourcesEnabled: false,

  priority: [
    "seeded-provider",
    "url-intake",
    "encompass-family",
    "sears-partsdirect",
    "partsdr",
    "appliancepartspros",
    "partselect.com",
    "fix.com",
    "repairclinic-family",
    "partswarehouse",
    "ereplacementparts",
    "appliancefactoryparts"
  ],

  forbidden: [
    "ge-official",
    "bosch-family",
    "frigidaire-family",
    "lg-family",
    "samsung-family",
    "marcone",
    "easyapplianceparts"
  ]
} as const;

export const SEEDED_SOURCE_TYPE_BY_PROVIDER: Record<string, "distributor" | "distributor-merged-with-partselect"> = {
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

  "appliance-parts-group": "regional-distributor",
  "dey-appliance-parts": "regional-distributor",
  "reliable-parts": "regional-distributor",
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
  skip_for_grounding: [
    "ge-official",
    "bosch-family",
    "frigidaire-family",
    "lg-family",
    "samsung-family",
    "whirlpool-family",
    "marcone",
    "easyapplianceparts"
  ]
};

export function getSourceTypeForProvider(provider: string) {
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
