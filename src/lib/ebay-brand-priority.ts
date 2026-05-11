export type EbayBrandPriority = "bread_and_butter" | "secondary" | "unknown_brand";

const GE_FAMILY = ["ge", "general electric", "hotpoint"];
const WHIRLPOOL_FAMILY = ["whirlpool"];
const MAYTAG_FAMILY = ["maytag"];
const GE_MODEL_PREFIXES = ["gdf", "gtd", "gtdx", "gtw", "htdx"];
const WHIRLPOOL_MODEL_PREFIXES = ["wed", "wrs", "wtw"];
const MAYTAG_MODEL_PREFIXES = ["med", "mhw", "mvw"];

function normalizeBrandText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAnyBrandToken(text: string, tokens: string[]) {
  return tokens.some((token) => {
    const normalized = normalizeBrandText(token);
    return text === normalized || text.includes(normalized);
  });
}

function normalizeModelText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function startsWithAny(value: string, prefixes: string[]) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function classifyEbayBrandPriority(input: {
  brand?: unknown;
  brandFamily?: unknown;
  resolvedOemBrand?: unknown;
  manufacturerFamily?: unknown;
  normalizedModel?: unknown;
}) {
  const searchText = [
    input.brand,
    input.brandFamily,
    input.resolvedOemBrand,
    input.manufacturerFamily,
  ]
    .map(normalizeBrandText)
    .filter(Boolean)
    .join(" | ");

  if (includesAnyBrandToken(searchText, GE_FAMILY)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "ge",
      priorityReason: "GE/Hotpoint machine family.",
    };
  }

  if (includesAnyBrandToken(searchText, WHIRLPOOL_FAMILY)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "whirlpool",
      priorityReason: "Whirlpool machine family.",
    };
  }

  if (includesAnyBrandToken(searchText, MAYTAG_FAMILY)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "maytag",
      priorityReason: "Maytag machine family.",
    };
  }

  const model = normalizeModelText(input.normalizedModel);
  if (!searchText && startsWithAny(model, GE_MODEL_PREFIXES)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "ge",
      priorityReason: "GE/Hotpoint inferred from normalized model prefix.",
    };
  }

  if (!searchText && startsWithAny(model, WHIRLPOOL_MODEL_PREFIXES)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "whirlpool",
      priorityReason: "Whirlpool inferred from normalized model prefix.",
    };
  }

  if (!searchText && startsWithAny(model, MAYTAG_MODEL_PREFIXES)) {
    return {
      brandPriority: "bread_and_butter" as EbayBrandPriority,
      normalizedBrandFamily: "maytag",
      priorityReason: "Maytag inferred from normalized model prefix.",
    };
  }

  if (!searchText) {
    return {
      brandPriority: "unknown_brand" as EbayBrandPriority,
      normalizedBrandFamily: "unknown",
      priorityReason: "No brand/family fields were present on the machine record.",
    };
  }

  return {
    brandPriority: "secondary" as EbayBrandPriority,
    normalizedBrandFamily: searchText.split(" | ")[0] || "secondary",
    priorityReason: "Known machine brand outside GE/Hotpoint/Whirlpool/Maytag first pass.",
  };
}

export function ebayBrandPriorityRank(priority: EbayBrandPriority | string | null | undefined) {
  if (priority === "bread_and_butter") return 0;
  if (priority === "secondary") return 1;
  return 2;
}
