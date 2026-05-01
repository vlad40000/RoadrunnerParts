export const SOURCE_TIERS = {
  tier0: {
    label: "Tier 0",
    suppliers: [
      "url-intake",
      "seeded-provider",
      "encompass-family",
      "partsdr",
      "appliancepartspros",
    ],
  },

  tier1: {
    label: "Tier 1",
    suppliers: [
      "encompass-family",
      "sears-partsdirect",
      "partsdr",
      "appliancepartspros",
    ],
  },

  tier2: {
    label: "Tier 2",
    suppliers: [
      "partselect.com",
      "fix.com",
      "repairclinic-family",
    ],
  },

  tier3: {
    label: "Tier 3",
    suppliers: [
      "partswarehouse",
      "ereplacementparts",
      "appliancefactoryparts",
      "appliance-parts-group",
      "dey-appliance-parts",
      "reliable-parts",
      "coast-appliance-parts",
    ],
  },
} as const;

export type SourceTierKey = keyof typeof SOURCE_TIERS;

export type SourceActionTask =
  | "parts_diagrams"
  | "parts_bom"
  | "pricing";

export function normalizeCanonicalModel(model: string) {
  return String(model || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeModelForSupplier(input: {
  supplier: string;
  model: string;
  brand?: string | null;
}) {
  const canonical = normalizeCanonicalModel(input.model);
  const brand = String(input.brand || "").toLowerCase();

  const isWhirlpoolFamily =
    brand.includes("whirlpool") ||
    brand.includes("maytag") ||
    brand.includes("kitchenaid") ||
    brand.includes("amana") ||
    brand.includes("jennair");

  const isGeFamily =
    brand === "ge" ||
    brand.includes("general electric") ||
    brand.includes("hotpoint") ||
    brand.includes("haier");

  if (input.supplier === "encompass-family") {
    if (isWhirlpoolFamily) return `WHI${canonical}`;
    if (isGeFamily) return `HOT${canonical}`;
    return canonical;
  }

  if (
    input.supplier === "partsdr" ||
    input.supplier === "appliancepartspros" ||
    input.supplier === "fix.com" ||
    input.supplier === "repairclinic-family" ||
    input.supplier === "partswarehouse" ||
    input.supplier === "ereplacementparts" ||
    input.supplier === "appliancefactoryparts"
  ) {
    return canonical.toLowerCase();
  }

  return canonical;
}

export function buildSupplierSearchUrl(input: {
  supplier: string;
  formattedModel: string;
  canonicalModel: string;
}) {
  const formatted = encodeURIComponent(input.formattedModel);
  const canonical = encodeURIComponent(input.canonicalModel);

  switch (input.supplier) {
    case "encompass-family":
      return `https://encompass.com/model/${formatted}`;

    case "sears-partsdirect":
      return `https://www.searspartsdirect.com/search?q=${canonical}`;

    case "partsdr":
      return `https://partsdr.com/search?query=${canonical}`;

    case "appliancepartspros":
      return `https://www.appliancepartspros.com/search.aspx?q=${canonical}`;

    case "partselect.com":
      return `https://www.partselect.com/Search.aspx?SearchTerm=${canonical}`;

    case "fix.com":
      return `https://www.fix.com/search/?SearchTerm=${canonical}`;

    case "repairclinic-family":
      return `https://www.repairclinic.com/Search?query=${canonical}`;

    case "partswarehouse":
      return `https://www.partswarehouse.com/search.asp?keyword=${canonical}`;

    case "ereplacementparts":
      return `https://www.ereplacementparts.com/search_result.php?q=${canonical}`;

    case "appliancefactoryparts":
      return `https://www.appliancefactoryparts.com/search/part/${canonical}/`;

    default:
      return `https://www.google.com/search?q=${encodeURIComponent(`${input.canonicalModel} appliance parts`)}`;
  }
}
