import "server-only";

export const SEEDED_SOURCE_TYPE_BY_PROVIDER: Record<string, "oem" | "distributor"> = {
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
};

export function getSourceTypeForProvider(provider: string): "oem" | "distributor" {
  return SEEDED_SOURCE_TYPE_BY_PROVIDER[provider] || "distributor";
}
