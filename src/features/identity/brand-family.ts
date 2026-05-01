import "server-only";
import { normalizeBrandLabel } from "./normalize";

export enum DecoderFamily {
  GE_FAMILY = "GE_FAMILY",
  WHIRLPOOL_FAMILY = "WHIRLPOOL_FAMILY",
  MAYTAG_LEGACY = "MAYTAG_LEGACY",
  ELECTROLUX_FAMILY = "ELECTROLUX_FAMILY",
  LG = "LG",
  BOSCH_BSH = "BOSCH_BSH",
  SAMSUNG = "SAMSUNG",
  ALLIANCE = "ALLIANCE",
  UNKNOWN = "UNKNOWN",
}

/**
 * Resolves the decoder family based on brand and model number heuristics.
 */
export function resolveDecoderFamily(brand: string, modelNumber: string = ""): DecoderFamily {
  const normalizedBrand = normalizeBrandLabel(brand);
  const normModel = String(modelNumber || "").toUpperCase().trim();

  // GE Family
  if (["GE", "Hotpoint", "Haier", "Monogram"].includes(normalizedBrand)) {
    return DecoderFamily.GE_FAMILY;
  }

  // Whirlpool Family
  if (["Whirlpool", "KitchenAid", "Amana", "Roper", "Estate", "Admiral", "Inglis", "Jenn-Air"].includes(normalizedBrand)) {
    return DecoderFamily.WHIRLPOOL_FAMILY;
  }

  // Maytag
  if (normalizedBrand === "Maytag") {
    // Legacy Maytag heuristic (e.g., ends in letter month/year code)
    if (normModel.match(/[A-Z]{2}\d{4}[A-Z]{2}$/)) {
      return DecoderFamily.MAYTAG_LEGACY;
    }
    return DecoderFamily.WHIRLPOOL_FAMILY;
  }

  // Electrolux Family
  if (["Frigidaire", "Electrolux", "Tappan", "Kelvinator", "Gibson"].includes(normalizedBrand)) {
    return DecoderFamily.ELECTROLUX_FAMILY;
  }

  // LG
  if (normalizedBrand === "LG") {
    return DecoderFamily.LG;
  }

  // Bosch
  if (["Bosch", "Thermador", "Gaggenau"].includes(normalizedBrand)) {
    return DecoderFamily.BOSCH_BSH;
  }

  // Samsung
  if (normalizedBrand === "Samsung") {
    return DecoderFamily.SAMSUNG;
  }

  // Alliance
  if (["Alliance", "Speed Queen", "Huebsch"].includes(normalizedBrand)) {
    return DecoderFamily.ALLIANCE;
  }

  // Kenmore OEM routing (heuristic based on model prefix)
  if (normalizedBrand === "Kenmore" || normModel.includes(".")) {
    const prefix = normModel.split(".")[0];
    const kenmoreOem: Record<string, DecoderFamily> = {
      "106": DecoderFamily.WHIRLPOOL_FAMILY,
      "110": DecoderFamily.WHIRLPOOL_FAMILY,
      "665": DecoderFamily.WHIRLPOOL_FAMILY,
      "587": DecoderFamily.ELECTROLUX_FAMILY,
      "253": DecoderFamily.ELECTROLUX_FAMILY,
      "417": DecoderFamily.ELECTROLUX_FAMILY,
      "795": DecoderFamily.LG,
      "796": DecoderFamily.LG,
      "401": DecoderFamily.SAMSUNG,
      "592": DecoderFamily.SAMSUNG,
      "363": DecoderFamily.GE_FAMILY,
      "362": DecoderFamily.GE_FAMILY,
      "911": DecoderFamily.GE_FAMILY,
    };
    const mapped = kenmoreOem[prefix];
    if (mapped) return mapped;
  }

  return DecoderFamily.UNKNOWN;
}
