import modelRouteSeeds from "@/data/provider-seeds/model-routes.json";

export const ALL_SUPPLIERS = [
  "encompass-family",
  "sears-partsdirect",
  "partsdr",
  "appliancepartspros",
  "partselect.com",
  "fix.com",
  "repairclinic-family",
  "url-intake",
  "seeded-provider",
  "partswarehouse",
  "ereplacementparts",
  "appliancefactoryparts",
  "appliance-parts-group",
  "dey-appliance-parts",
  "reliable-parts",
  "coast-appliance-parts",
] as const;

export type ManualSourceActionTask =
  | "lock_supplier_target"
  | "load_supplier_index"
  | "run_supplier_agent"
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
  return String(model || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function inferEncompassPrefix(input: {
  model: string;
  brand?: string | null;
}) {
  const model = normalizeCanonicalModel(input.model);
  const brand = String(input.brand || "").toLowerCase();

  if (brand.includes("hotpoint") || /^(HTW|HTX)/.test(model)) {
    return "HOT";
  }

  if (
    brand.includes("whirlpool") ||
    brand.includes("maytag") ||
    brand.includes("kitchenaid") ||
    brand.includes("amana") ||
    /^(WTW|WED|WGD|WFW|WRS|WRF|MVW|MED|MGD|MDB|KUD|KUDE|KDT|AER|NTW)/.test(model)
  ) {
    return "WHI";
  }

  if (
    brand === "ge" ||
    brand.includes("general electric") ||
    /^(GTW|GTD|GFW|GDF|PDT)/.test(model)
  ) {
    return "GEN";
  }

  if (brand.includes("lg") || /^(LDF|WM|DLG|DLE|LFX|LRF)/.test(model)) {
    return "LGE";
  }

  if (brand.includes("samsung") || /^(WA|WF|DV|DW|RF)/.test(model)) {
    return "SAM";
  }

  if (
    brand.includes("frigidaire") ||
    brand.includes("electrolux") ||
    /^(FF|FG|EI|EF|EW)/.test(model)
  ) {
    return "FRI";
  }

  return "";
}

export function buildCanonicalEncompassUrls(input: {
  model: string;
  brand?: string | null;
}) {
  const canonical = normalizeCanonicalModel(input.model);
  const prefix = inferEncompassPrefix(input);

  if (!canonical || !prefix) {
    return {
      prefix,
      regularModelUrl: "",
      regularModelUrlAlt: "",
      explodedViewUrl: "",
    };
  }

  return {
    prefix,
    regularModelUrl: `https://partstore.encompass.com/model/${prefix}${canonical}`,
    regularModelUrlAlt: `https://encompass.com/model/${prefix}${canonical}`,
    explodedViewUrl: `https://encompass.com/Exploded-View-Assembly/${prefix}/${canonical}`,
  };
}

export function buildKnownEncompassAssemblyUrl(model: string) {
  const canonical = normalizeCanonicalModel(model);
  const seedRoute = modelRouteSeeds.find((route) => {
    return (
      route.provider === "encompass-family" &&
      normalizeCanonicalModel(route.model) === canonical &&
      typeof route.providerAssemblyUrl === "string" &&
      route.providerAssemblyUrl.trim()
    );
  });

  if (seedRoute?.providerAssemblyUrl) {
    return seedRoute.providerAssemblyUrl;
  }

  const canonicalUrl = buildCanonicalEncompassUrls({ model: canonical }).explodedViewUrl;
  if (canonicalUrl) return canonicalUrl;

  if (canonical === "MAYMVWB300WQ2") {
    return "https://encompass.com/Exploded-View-Assembly/MAY/9272/MVWB300WQ2";
  }

  if (canonical === "MLE2000AYW") {
    return "https://encompass.com/Exploded-View-Assembly/WHI/12074/MLE2000AYW";
  }

  const maytagMatch = canonical.match(/^MAY(.+)$/);
  if (maytagMatch?.[1]) {
    return `https://encompass.com/Exploded-View-Assembly/MAY/9272/${maytagMatch[1]}`;
  }

  return null;
}

export function normalizeModelForSupplier(input: {
  supplier: string;
  model: string;
  brand?: string | null;
}) {
  const supplier = normalizeSupplierId(input.supplier);
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

  if (supplier === "encompass-family") {
    if (isWhirlpoolFamily) return `WHI${canonical}`;
    if (isGeFamily) return `HOT${canonical}`;
    return canonical;
  }

  if (
    supplier === "partsdr" ||
    supplier === "appliancepartspros" ||
    supplier === "fix.com" ||
    supplier === "repairclinic-family" ||
    supplier === "partswarehouse" ||
    supplier === "ereplacementparts" ||
    supplier === "appliancefactoryparts"
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
  const supplier = normalizeSupplierId(input.supplier);
  const formatted = encodeURIComponent(input.formattedModel);
  const canonical = encodeURIComponent(input.canonicalModel);

  switch (supplier) {
    case "encompass-family":
      return (
        buildKnownEncompassAssemblyUrl(input.canonicalModel) ||
        buildKnownEncompassAssemblyUrl(input.formattedModel) ||
        ""
      );

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
  switch (normalizeSupplierId(supplier)) {
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
  return `${normalizeSupplierId(supplier)}:${normalizeCanonicalModel(canonicalModel)}`;
}

export function normalizeSupplierId(supplier: string) {
  switch (String(supplier || "").trim().toLowerCase()) {
    case "sears":
    case "sears-partsdirect":
    case "searspartsdirect.com":
      return "sears-partsdirect";
    case "repairclinic":
    case "repairclinic-family":
    case "repairclinic.com":
      return "repairclinic-family";
    case "fix":
    case "fix.com":
      return "fix.com";
    case "appliancepartspros":
    case "appliancepartspros.com":
      return "appliancepartspros";
    case "encompass":
    case "encompass-family":
      return "encompass-family";
    case "partselect":
    case "partselect.com":
      return "partselect.com";
    default:
      return String(supplier || "").trim().toLowerCase();
  }
}
