export type BrandFamily = 
  | "GE" 
  | "BOSCH" 
  | "WHIRLPOOL" 
  | "SAMSUNG" 
  | "LG" 
  | "MAYTAG" 
  | "KENMORE" 
  | "KITCHENAID" 
  | "FRIGIDAIRE" 
  | "ELECTROLUX" 
  | "OTHER";

export type SourceKey = 
  | "geappliances.com"
  | "bosch-home.com"
  | "whirlpool.com"
  | "samsung.com"
  | "lg.com"
  | "sears-partsdirect"
  | "repairclinic-family"
  | "appliancepartspros"
  | "fix.com"
  | "encompass.com"
  | "partselect.com";

export const SOURCE_DOMAIN_MAP: Record<SourceKey, string> = {
  "geappliances.com": "geappliances.com",
  "bosch-home.com": "bosch-home.com",
  "whirlpool.com": "whirlpool.com",
  "samsung.com": "samsung.com",
  "lg.com": "lg.com",
  "sears-partsdirect": "searspartsdirect.com",
  "repairclinic-family": "repairclinic.com",
  "appliancepartspros": "appliancepartspros.com",
  "fix.com": "fix.com",
  "encompass.com": "encompass.com",
  "partselect.com": "partselect.com",
};

export const BRAND_SOURCE_GATE: Record<BrandFamily, SourceKey[]> = {
  GE: ["geappliances.com", "sears-partsdirect", "encompass.com", "appliancepartspros"],
  BOSCH: ["bosch-home.com", "encompass.com", "appliancepartspros"],
  WHIRLPOOL: ["whirlpool.com", "sears-partsdirect", "repairclinic-family", "appliancepartspros", "fix.com"],
  SAMSUNG: ["samsung.com", "sears-partsdirect", "appliancepartspros", "encompass.com"],
  LG: ["lg.com", "sears-partsdirect", "appliancepartspros", "encompass.com"],
  MAYTAG: ["whirlpool.com", "sears-partsdirect", "repairclinic-family", "appliancepartspros"],
  KENMORE: ["sears-partsdirect", "repairclinic-family", "appliancepartspros", "fix.com"],
  KITCHENAID: ["whirlpool.com", "sears-partsdirect", "repairclinic-family", "appliancepartspros"],
  FRIGIDAIRE: ["sears-partsdirect", "repairclinic-family", "appliancepartspros", "fix.com"],
  ELECTROLUX: ["sears-partsdirect", "repairclinic-family", "appliancepartspros"],
  OTHER: ["sears-partsdirect", "repairclinic-family", "appliancepartspros", "fix.com", "encompass.com"],
};

export function resolveApprovedSources(brandFamily: string): SourceKey[] {
  const normalizedBrand = (brandFamily?.toUpperCase() || "OTHER") as BrandFamily;
  return BRAND_SOURCE_GATE[normalizedBrand] || BRAND_SOURCE_GATE.OTHER;
}

export function getBrandGateConfig(brandFamily: string) {
  const approved = resolveApprovedSources(brandFamily);
  const allSources: SourceKey[] = [
    "geappliances.com",
    "bosch-home.com",
    "whirlpool.com",
    "samsung.com",
    "lg.com",
    "sears-partsdirect",
    "repairclinic-family",
    "appliancepartspros",
    "fix.com",
    "encompass.com",
    "partselect.com",
  ];
  const forbidden = allSources.filter((s) => !approved.includes(s));
  const forbiddenDomains = forbidden.map((s) => SOURCE_DOMAIN_MAP[s]);
  const approvedDomains = approved.map((s) => SOURCE_DOMAIN_MAP[s]);
  
  return { approved, forbidden, approvedDomains, forbiddenDomains };
}

export function resolveBrandSourceGate(input: {
  brand: string;
  resolvedBrand: string;
}) {
  const brandFamily = (input.resolvedBrand?.toUpperCase() ||
    input.brand?.toUpperCase() ||
    "OTHER") as BrandFamily;
  const config = getBrandGateConfig(brandFamily);

  return {
    brandFamily,
    primarySources: config.approved.filter((s) => !s.includes(".com")).slice(0, 3),
    secondarySources: config.approved,
    forbiddenSources: config.forbidden,
    forbiddenDomains: config.forbiddenDomains,
  };
}

export function formatBrandSourceGateForPrompt(input: {
  brand?: string | null;
  brandFamily?: string | null;
}) {
  const brand = input.brandFamily || input.brand || "OTHER";
  const { approvedDomains, forbiddenDomains } = getBrandGateConfig(brand);

  return `
<brand_source_gate>
  <active_brand>${brand}</active_brand>
  <approved_sources>
    ${approvedDomains.map((s) => `<source>${s}</source>`).join("\n    ")}
  </approved_sources>
  <forbidden_sources>
    ${forbiddenDomains.map((s) => `<source>${s}</source>`).join("\n    ")}
  </forbidden_sources>
</brand_source_gate>
`.trim();
}
