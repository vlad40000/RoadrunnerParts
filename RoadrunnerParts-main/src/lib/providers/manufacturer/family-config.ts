type ManufacturerFamilyConfig = {
  key: string;
  adapterKey: string;
  domains: string[];
  brands: string[];
};

const FAMILIES: ManufacturerFamilyConfig[] = [
  {
    key: "whirlpool-family",
    adapterKey: "whirlpool-family",
    domains: ["whirlpoolparts.com", "repairclinic.com", "searspartsdirect.com"],
    brands: ["whirlpool", "maytag", "kitchenaid", "amana", "jennair", "kenmore"],
  },
  {
    key: "ge-family",
    adapterKey: "ge-official",
    domains: ["geapplianceparts.com", "geappliances.com"],
    brands: ["ge", "general electric", "hotpoint", "haier", "cafe", "monogram"],
  },
  {
    key: "frigidaire-family",
    adapterKey: "frigidaire-family",
    domains: ["frigidaireapplianceparts.com", "searspartsdirect.com"],
    brands: ["frigidaire", "electrolux"],
  },
  {
    key: "lg-family",
    adapterKey: "lg-family",
    domains: ["lgparts.com", "lg.com"],
    brands: ["lg"],
  },
  {
    key: "samsung-family",
    adapterKey: "samsung-family",
    domains: ["samsungpartsusa.com", "samsung.com"],
    brands: ["samsung"],
  },
  {
    key: "bosch-family",
    adapterKey: "bosch-family",
    domains: ["bosch-home.com"],
    brands: ["bosch", "thermador", "gaggenau"],
  },
];

function normalizeBrand(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+appliances?$/i, "");
}

function familyFromBrand(brand: string | null | undefined) {
  const normalized = normalizeBrand(brand);
  return FAMILIES.find((family) =>
    family.brands.some((candidate) => normalized === candidate || normalized.includes(candidate)),
  );
}

export function resolveTrueOemBrand(
  brand: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const normalizedBrand = normalizeBrand(brand);
  const normalizedModel = String(model || "").trim().toUpperCase();

  if (normalizedBrand === "kenmore") {
    const prefix = normalizedModel.match(/^(\d{3})/)?.[1];
    if (prefix === "110" || prefix === "665") return "Whirlpool";
    if (prefix === "253" || prefix === "417") return "Frigidaire";
    if (prefix === "795") return "LG";
    if (prefix === "401") return "Samsung";
  }

  const family = familyFromBrand(brand);
  if (!family) return brand ? String(brand).trim() : null;

  const preferred = family.brands[0];
  if (preferred === "ge") return "GE";
  if (preferred === "lg") return "LG";
  return preferred.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getManufacturerFamilyConfig(
  brand: string | null | undefined,
  model: string | null | undefined,
): ManufacturerFamilyConfig | null {
  const resolved = resolveTrueOemBrand(brand, model);
  return familyFromBrand(resolved) ?? null;
}
