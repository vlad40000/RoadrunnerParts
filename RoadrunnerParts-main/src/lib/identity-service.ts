import { buildEncompassUrls } from "./encompass-routes";

/**
 * Deterministic normalization and validation for model/serial identifiers.
 * Keeps the OCR route and related lookup cascades stable while the rest of the
 * source-routing stack is being migrated.
 */

export type ModelIdentity = {
  rawModel: string;
  normalizedModel: string;
  brand: string | null;
  brandCode?: string | null;
  serial?: string | null;
  productType?: string | null;
  confidence: number;
  source: "manual" | "ocr" | "spreadsheet" | "pdf" | "db";
  encompassUrls?: {
    modelPage: string;
    explodedView: string;
  };
};

export type IdentityPacket = {
  brand?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  source?: ModelIdentity["source"];
};

function normalizeLookupKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeIdentifier(val: string | null | undefined) {
  if (!val || typeof val !== "string") return "";
  return val.trim().toUpperCase().replace(/[\s.\\]+/g, "");
}

export function strictNormalize(val: string | null | undefined) {
  return normalizeIdentifier(val).replace(/[^A-Z0-9]/g, "");
}

export function getLookupCandidates(rawModel: string | null | undefined) {
  if (!rawModel) return [];
  const normalized = normalizeIdentifier(rawModel);
  const strict = strictNormalize(rawModel);

  const candidates = new Set([normalized, strict]);

  if (normalized.includes("/")) {
    candidates.add(normalized.split("/")[0]);
  }

  return Array.from(candidates);
}

export function getOcrCandidates(val: string | null | undefined) {
  const normalized = normalizeIdentifier(val);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const swapMap: Record<string, string> = {
    O: "0",
    "0": "O",
    I: "1",
    "1": "I",
    S: "5",
    "5": "S",
    B: "8",
    "8": "B",
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (swapMap[char]) {
      candidates.add(
        normalized.substring(0, i) + swapMap[char] + normalized.substring(i + 1),
      );
    }
  }

  return Array.from(candidates);
}

export function classifyFamily(brand: string | null | undefined) {
  const normalized = normalizeLookupKey(brand);

  if (!normalized) return "Unknown";
  if (normalized.includes("bosch") || normalized.includes("thermador") || normalized.includes("gaggenau")) return "BSH";
  if (normalized.includes("samsung")) return "Samsung";
  if (normalized === "lg") return "LG";
  if (normalized.includes("frigidaire") || normalized.includes("electrolux")) return "Electrolux";
  if (
    normalized.includes("whirlpool") ||
    normalized.includes("maytag") ||
    normalized.includes("kitchenaid") ||
    normalized.includes("amana") ||
    normalized.includes("jennair")
  ) {
    return "Whirlpool";
  }
  if (
    normalized === "ge" ||
    normalized.includes("generalelectric") ||
    normalized.includes("hotpoint") ||
    normalized.includes("haier") ||
    normalized.includes("cafe") ||
    normalized.includes("monogram")
  ) {
    return "GE";
  }

  return "Unknown";
}

export function validateIdentity(packet: {
  model_normalized?: string | null;
}) {
  const errors: string[] = [];
  if (!packet.model_normalized) {
    errors.push("Missing normalized model number.");
  }

  const isSuspicious =
    packet.model_normalized && packet.model_normalized.length < 4;
  if (isSuspicious) {
    errors.push("Model number too short to be valid.");
  }

  return {
    ok: errors.length === 0,
    errors,
    identity: packet,
  };
}

export function extractIdentity({
  brand,
  modelNumber,
  serialNumber,
  source = "manual",
}: IdentityPacket): ModelIdentity {
  const modelNorm = normalizeIdentifier(modelNumber);
  const serialNorm = normalizeIdentifier(serialNumber);
  
  // Deterministic brand resolution happens here or is passed in
  // For now, we'll keep classifyFamily but aim for the Encompass resolver
  const brandNorm = brand ? brand.trim().toUpperCase() : null;
  const encompass = buildEncompassUrls(modelNorm);

  return {
    rawModel: modelNumber || "",
    normalizedModel: modelNorm,
    brand: encompass.brand || brandNorm,
    brandCode: encompass.brandCode || null,
    serial: serialNorm || null,
    confidence: modelNorm ? 0.95 : 0,
    source,
    encompassUrls: encompass.regularModelUrl ? {
      modelPage: encompass.regularModelUrl,
      explodedView: encompass.explodedViewUrl,
    } : undefined,
  };
}
