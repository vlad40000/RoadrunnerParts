export const SOURCE_TIERS = {
  tier0: {
    label: "Tier 0",
    description: "Manual URL, uploaded diagram, or saved source.",
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
    description: "Primary controlled supplier sources.",
    suppliers: [
      "encompass-family",
      "sears-partsdirect",
      "partsdr",
      "appliancepartspros",
    ],
  },

  tier2: {
    label: "Tier 2",
    description: "Secondary supplier backup.",
    suppliers: [
      "partselect.com",
      "fix.com",
      "repairclinic-family",
    ],
  },

  tier3: {
    label: "Tier 3",
    description: "Manual backup suppliers. Disable backend actions unless implemented.",
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

export type ManualSourceActionTask =
  | "lock_supplier_target"
  | "load_supplier_index"
  | "extract_selected_assemblies"
  | "price_encompass"
  | "price_backup_1"
  | "price_backup_2";

export type SupplierAssemblyStatus =
  | "pending"
  | "selected"
  | "extracting"
  | "partial"
  | "complete"
  | "failed"
  | "count_unknown";

export type SupplierAssemblyIndexItem = {
  id: string;
  title: string;
  sourceUrl: string;
  supplierCount: number | null;
  countEvidence: string | null;
  selected: boolean;
  overrideCount: number | null;
  status: SupplierAssemblyStatus;
  actualCount: number;
  error?: string | null;
};

export type SupplierAssemblyIndex = {
  supplier: string;
  canonicalModel: string;
  formattedModel: string;
  sourceUrl: string;
  totalCount: number | null;
  totalCountEvidence: string | null;
  totalCountSourceUrl: string | null;
  loadedAt: string;
  assemblies: SupplierAssemblyIndexItem[];
};

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
      return `https://www.google.com/search?q=${encodeURIComponent(
        `${input.canonicalModel} appliance parts`,
      )}`;
  }
}

export function supplierDisplayName(supplier: string) {
  switch (supplier) {
    case "encompass-family":
      return "Encompass";
    case "sears-partsdirect":
      return "Sears PartsDirect";
    case "partsdr":
      return "PartsDr";
    case "appliancepartspros":
      return "AppliancePartsPros";
    case "partselect.com":
      return "PartSelect";
    case "fix.com":
      return "Fix.com";
    case "repairclinic-family":
      return "RepairClinic";
    case "url-intake":
      return "Manual URL Intake";
    case "seeded-provider":
      return "Saved / Seeded Source";
    default:
      return supplier;
  }
}

export function supplierIndexKey(supplier: string, canonicalModel: string) {
  return `${supplier}:${normalizeCanonicalModel(canonicalModel)}`;
}
