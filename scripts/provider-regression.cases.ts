export type ProviderRegressionCase = {
  key:
    | "ge"
    | "whirlpool"
    | "frigidaire"
    | "lg"
    | "samsung"
    | "bosch"
    | "hisense"
    | "maytag";
  label: string;
  brand: string;
  model: string;
  expectedProvider:
    | "ge-official"
    | "repairclinic-family"
    | "frigidaire-family"
    | "lg-family"
    | "samsung-family"
    | "bosch-family"
    | "hisense-family"
    | "fix-com-diagrams";
  minRows: number;
};

function envOr(name: string, fallback: string) {
  return String(process.env[name] || "").trim() || fallback;
}

export const PROVIDER_REGRESSION_CASES: ProviderRegressionCase[] = [
  {
    key: "ge",
    label: "GE",
    brand: "GE",
    model: envOr("PROVIDER_REGRESSION_GE_MODEL", "GUD27ESSM1WW"),
    expectedProvider: "ge-official",
    minRows: 1,
  },
  {
    key: "whirlpool",
    label: "Whirlpool",
    brand: "Whirlpool",
    model: envOr("PROVIDER_REGRESSION_WHIRLPOOL_MODEL", "WDT730PAHZ0"),
    expectedProvider: "repairclinic-family",
    minRows: 1,
  },
  {
    key: "frigidaire",
    label: "Frigidaire",
    brand: "Frigidaire",
    model: envOr("PROVIDER_REGRESSION_FRIGIDAIRE_MODEL", "FFCD2413US0A"),
    expectedProvider: "frigidaire-family",
    minRows: 1,
  },
  {
    key: "lg",
    label: "LG",
    brand: "LG",
    model: envOr("PROVIDER_REGRESSION_LG_MODEL", "WM2501HWA"),
    expectedProvider: "lg-family",
    minRows: 1,
  },
  {
    key: "samsung",
    label: "Samsung",
    brand: "Samsung",
    model: envOr("PROVIDER_REGRESSION_SAMSUNG_MODEL", "RF28R7351SR/AA"),
    expectedProvider: "samsung-family",
    minRows: 1,
  },
  {
    key: "bosch",
    label: "Bosch",
    brand: "Bosch",
    model: envOr("PROVIDER_REGRESSION_BOSCH_MODEL", "SHE3AR76UC/22"),
    expectedProvider: "bosch-family",
    minRows: 1,
  },
  {
    key: "hisense",
    label: "Hisense",
    brand: "Hisense",
    model: envOr("PROVIDER_REGRESSION_HISENSE_MODEL", "HRT180N6AWD"),
    expectedProvider: "hisense-family",
    minRows: 1,
  },
  {
    key: "maytag",
    label: "Maytag",
    brand: "Maytag",
    model: envOr("PROVIDER_REGRESSION_MAYTAG_MODEL", "MVWC565FW0"),
    expectedProvider: "fix-com-diagrams",
    minRows: 1,
  },
];
