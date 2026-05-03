export type BrandFamily =
  | "whirlpool-family"
  | "ge-family"
  | "frigidaire-family"
  | "lg-family"
  | "samsung-family"
  | "bosch-family"
  | "unknown";

export type SourceKey =
  | "sears-partsdirect"
  | "appliancepartspros"
  | "repairclinic-family"
  | "fix.com";

export const DISTRIBUTOR_PRIMARY_SOURCES: SourceKey[] = [
  "sears-partsdirect",
  "fix.com",
];

export const DISTRIBUTOR_SECONDARY_SOURCES: SourceKey[] = [
  "appliancepartspros",
  "repairclinic-family",
];

export const UNIVERSAL_DISTRIBUTOR_SOURCES: SourceKey[] = [
  ...DISTRIBUTOR_PRIMARY_SOURCES,
  ...DISTRIBUTOR_SECONDARY_SOURCES,
];

// OEM Sources are strictly forbidden for BOM retrieval
export const BLOCKED_SEARCH_DOMAINS = [
  "geapplianceparts.com",
  "geappliances.com",
  "products.geappliances.com",
  "bosch-home.com",
  "frigidaire.com",
  "frigidaireapplianceparts.com",
  "lg.com",
  "lgparts.com",
  "samsung.com",
  "samsungparts.com",
  "samsungpartsusa.com",
  "whirlpool.com",
  "whirlpoolparts.com",
  "maytag.com",
  "kitchenaid.com",
  "amana.com",
  "jennair.com",
  "marcone.com",
  "easyapplianceparts.com"
];

export const BLOCKED_SOURCES = [
  "ge-official",
  "bosch-family",
  "frigidaire-family",
  "lg-family",
  "samsung-family"
];

export const SOURCE_DOMAINS: Record<SourceKey, string[]> = {
  "sears-partsdirect": ["searspartsdirect.com"],
  appliancepartspros: ["appliancepartspros.com"],
  "repairclinic-family": ["repairclinic.com"],
  "fix.com": ["fix.com"],
};

export const SOURCE_POLICY = {
  mode: "distributor_only",
  oemSourcesEnabled: false,
  priority: [
    "seeded-provider",
    "url-intake",
    "sears-partsdirect",
    "fix.com",
    "appliancepartspros",
    "repairclinic-family",
  ],
} as const;

export const BRAND_SOURCE_GATE: Record<
  BrandFamily,
  { primarySources: SourceKey[]; secondarySources: SourceKey[] }
> = {
  "ge-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  "bosch-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  "frigidaire-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  "lg-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  "samsung-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  "whirlpool-family": {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
  unknown: {
    primarySources: DISTRIBUTOR_PRIMARY_SOURCES,
    secondarySources: DISTRIBUTOR_SECONDARY_SOURCES,
  },
};

export type BrandSourceGate = {
  brandFamily: BrandFamily;
  primarySources: SourceKey[];
  secondarySources: SourceKey[];
  approvedSources: SourceKey[];
  forbiddenSources: string[];
  approvedDomains: string[];
  forbiddenDomains: string[];
  hardBlockedDomains: string[];
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
    return normalized as BrandFamily;
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
  const hardBlockedDomains =
    brandFamily === "lg-family"
      ? [
          "samsung.com",
          "samsungparts.com",
          "samsungpartsusa.com",
          "bosch-home.com",
          "hisense.com",
          "hisense.encompass.com",
          "encompass.com",
          "partstore.encompass.com",
        ]
      : [];

  return {
    brandFamily,
    primarySources: gate.primarySources,
    secondarySources: gate.secondarySources,
    approvedSources,
    forbiddenSources: BLOCKED_SOURCES,
    approvedDomains: domainsForSources(approvedSources),
    forbiddenDomains: BLOCKED_SEARCH_DOMAINS,
    hardBlockedDomains,
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
    `hard_blocked_domains: ${gate.hardBlockedDomains.join(", ") || "NONE"}`,
    `primary_sources: ${gate.primarySources.join(", ")}`,
    `secondary_sources: ${gate.secondarySources.join(", ")}`,
    `approved_domains: ${gate.approvedDomains.join(", ")}`,
    `forbidden_domains: ${gate.forbiddenDomains.join(", ")}`,
    "</brand_source_gate>",
  ].join("\n");
}
