export type BrandFamily =
  | "whirlpool-family"
  | "ge-family"
  | "frigidaire-family"
  | "lg-family"
  | "samsung-family"
  | "bosch-family"
  | "unknown";

export type SourceKey =
  | "ge-official"
  | "bosch-family"
  | "frigidaire-family"
  | "lg-family"
  | "samsung-family"
  | "whirlpool-family"
  | "encompass"
  | "encompass-family"
  | "sears-partsdirect"
  | "partsdr"
  | "appliancepartspros"
  | "repairclinic-family"
  | "partselect.com"
  | "fix.com"
  | "marcone"
  | "easyapplianceparts";

const PRIMARY_SOURCES: SourceKey[] = [
  "encompass",
  "sears-partsdirect",
  "partsdr",
];

const SECONDARY_SOURCES: SourceKey[] = [
  "appliancepartspros",
  "repairclinic-family",
  "partselect.com",
  "fix.com",
  "marcone",
  "easyapplianceparts",
];

const UNIVERSAL_DISTRIBUTOR_SOURCES: SourceKey[] = [
  ...PRIMARY_SOURCES,
  ...SECONDARY_SOURCES,
];

const OEM_SOURCE_KEYS: SourceKey[] = [
  "ge-official",
  "bosch-family",
  "frigidaire-family",
  "lg-family",
  "samsung-family",
  "whirlpool-family",
];

export const SOURCE_DOMAINS: Record<SourceKey, string[]> = {
  "ge-official": [
    "geapplianceparts.com",
    "geappliances.com",
    "products.geappliances.com",
  ],
  "bosch-family": ["bosch-home.com"],
  "frigidaire-family": [
    "frigidaire.com",
    "frigidaireapplianceparts.com",
  ],
  "lg-family": ["lg.com", "lgparts.com"],
  "samsung-family": ["samsung.com", "samsungparts.com", "samsungpartsusa.com"],
  "whirlpool-family": [
    "whirlpool.com",
    "whirlpoolparts.com",
    "maytag.com",
    "kitchenaid.com",
    "amana.com",
    "jennair.com",
  ],
  encompass: ["encompass.com"],
  "encompass-family": ["encompass.com"],
  "sears-partsdirect": ["searspartsdirect.com"],
  partsdr: ["partsdr.com"],
  appliancepartspros: ["appliancepartspros.com"],
  "repairclinic-family": ["repairclinic.com"],
  "partselect.com": ["partselect.com"],
  "fix.com": ["fix.com"],
};

export const SOURCE_POLICY = {
  defaultMode: "distributor_first",
  oemEnabledByDefault: false,
  allowOemWhenUserProvidesUrl: true,
  allowOemForIdentityRepair: true,
  allowOemForSerialDecoding: true,
  allowOemForKnownDeterministicPartsEndpoint: true
};

export const BRAND_SOURCE_GATE: Record<
  BrandFamily,
  { primarySources: SourceKey[]; secondarySources: SourceKey[]; forbiddenSources: SourceKey[] }
> = {
  "ge-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  "bosch-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  "frigidaire-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  "lg-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  "samsung-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  "whirlpool-family": {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
  unknown: {
    primarySources: PRIMARY_SOURCES,
    secondarySources: SECONDARY_SOURCES,
    forbiddenSources: OEM_SOURCE_KEYS,
  },
};

export type BrandSourceGate = {
  brandFamily: BrandFamily;
  primarySources: SourceKey[];
  secondarySources: SourceKey[];
  approvedSources: SourceKey[];
  forbiddenSources: SourceKey[];
  approvedDomains: string[];
  forbiddenDomains: string[];
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function domainsForSources(sources: SourceKey[]) {
  return dedupe(sources.flatMap((source) => SOURCE_DOMAINS[source] ?? []));
}

function normalizeBrandFamily(value: string | null | undefined): BrandFamily {
  const normalized = normalize(value);

  if (!normalized) return "unknown";
  if (normalized.includes("bosch") || normalized.includes("thermador") || normalized.includes("gaggenau")) return "bosch-family";
  if (normalized.includes("samsung")) return "samsung-family";
  if (normalized === "lg" || normalized.includes("lg ")) return "lg-family";
  if (normalized.includes("frigidaire") || normalized.includes("electrolux")) return "frigidaire-family";
  if (
    normalized.includes("whirlpool") ||
    normalized.includes("maytag") ||
    normalized.includes("kitchenaid") ||
    normalized.includes("amana") ||
    normalized.includes("jennair")
  ) {
    return "whirlpool-family";
  }
  if (
    normalized === "ge" ||
    normalized.includes("general electric") ||
    normalized.includes("hotpoint") ||
    normalized.includes("haier") ||
    normalized.includes("cafe") ||
    normalized.includes("monogram")
  ) {
    return "ge-family";
  }

  if (
    normalized === "ge-family" ||
    normalized === "bosch-family" ||
    normalized === "frigidaire-family" ||
    normalized === "lg-family" ||
    normalized === "samsung-family" ||
    normalized === "whirlpool-family"
  ) {
    return normalized;
  }

  return "unknown";
}

export function resolveBrandSourceGate(input: {
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}): BrandSourceGate {
  const brandFamily =
    normalizeBrandFamily(input.brandFamily) !== "unknown"
      ? normalizeBrandFamily(input.brandFamily)
      : normalizeBrandFamily(input.resolvedBrand ?? input.brand);
  const gate = BRAND_SOURCE_GATE[brandFamily];

  const approvedSources = [...gate.primarySources, ...gate.secondarySources];

  return {
    brandFamily,
    primarySources: gate.primarySources,
    secondarySources: gate.secondarySources,
    approvedSources,
    forbiddenSources: gate.forbiddenSources,
    approvedDomains: domainsForSources(approvedSources),
    forbiddenDomains: domainsForSources(gate.forbiddenSources),
  };
}

export function hostnameMatchesDomain(urlOrDomain: string, domain: string) {
  const normalizedDomain = normalize(domain);
  if (!normalizedDomain) return false;

  try {
    const host = new URL(
      urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`,
    ).hostname.toLowerCase();

    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  } catch {
    const candidate = normalize(urlOrDomain);
    return candidate === normalizedDomain || candidate.endsWith(`.${normalizedDomain}`);
  }
}

export function isDomainApprovedForBrand(input: {
  domain: string;
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}) {
  const gate = resolveBrandSourceGate(input);
  return gate.approvedDomains.some((domain) => hostnameMatchesDomain(input.domain, domain));
}

export function isDomainForbiddenForBrand(input: {
  domain: string;
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}) {
  const gate = resolveBrandSourceGate(input);
  return gate.forbiddenDomains.some((domain) => hostnameMatchesDomain(input.domain, domain));
}

export function formatBrandSourceGateForPrompt(input: {
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}) {
  const gate = resolveBrandSourceGate(input);

  return [
    "<brand_source_gate>",
    `brand_family: ${gate.brandFamily}`,
    `primary_sources: ${gate.primarySources.join(", ")}`,
    `secondary_sources: ${gate.secondarySources.join(", ")}`,
    `approved_domains: ${gate.approvedDomains.join(", ")}`,
    `forbidden_sources: ${gate.forbiddenSources.join(", ")}`,
    `forbidden_domains: ${gate.forbiddenDomains.join(", ")}`,
    "</brand_source_gate>",
  ].join("\n");
}
