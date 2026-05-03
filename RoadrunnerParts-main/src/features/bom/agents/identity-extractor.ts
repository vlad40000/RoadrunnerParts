import {
  extractedIdentitySchema,
  modelIdentitySchema,
  type ModelIdentity,
  type RawExtractedIdentity,
} from "../schemas/bom";
import { IDENTITY_EXTRACTION_PROMPT } from "../prompts/identity";

export type IdentityEvidenceFile = {
  mimeType: string;
  uri?: string;
  data?: string;
};

export type IdentityUserHints = {
  brand?: string;
  model?: string;
  serial?: string;
  productType?: string;
};

export type IdentityExtractionResult = ModelIdentity & {
  model: string;
  productType: string | null;
  raw_extracted_identity: RawExtractedIdentity;
  model_identity: ModelIdentity;
  evidence_text: string | null;
};

export function normalizeIdentityModel(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9./-]/g, "");
}

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function flagsFrom(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function buildIdentityEvidenceText(input: {
  userHints?: IdentityUserHints;
  evidenceText?: string | string[];
}) {
  const blocks: string[] = [];

  if (input.userHints) {
    const hints = input.userHints;
    blocks.push(`USER_HINT_BRAND: ${hints.brand ?? "unknown"}`);
    blocks.push(`USER_HINT_MODEL: ${hints.model ?? "unknown"}`);
    blocks.push(`USER_HINT_SERIAL: ${hints.serial ?? "unknown"}`);
    blocks.push(`USER_HINT_PRODUCT: ${hints.productType ?? "unknown"}`);
  }

  const evidenceBlocks = Array.isArray(input.evidenceText)
    ? input.evidenceText
    : input.evidenceText
      ? [input.evidenceText]
      : [];

  for (const [index, block] of evidenceBlocks.entries()) {
    const text = String(block || "").trim();
    if (!text) continue;
    const label = text.startsWith("# Manual Identity Context")
      ? "MANUAL_CONTEXT"
      : `EVIDENCE_TEXT_${index + 1}`;
    blocks.push(`${label}:\n${text}`);
  }

  return blocks.join("\n\n").trim();
}

function coerceRawIdentity(raw: any): RawExtractedIdentity {
  return extractedIdentitySchema.parse({
    raw_brand: normalizeNullableText(raw?.raw_brand ?? raw?.brand),
    raw_model: normalizeNullableText(raw?.raw_model ?? raw?.normalized_model ?? raw?.model),
    raw_serial: normalizeNullableText(raw?.raw_serial ?? raw?.serial),
    raw_product_type: normalizeNullableText(
      raw?.raw_product_type ?? raw?.product_type ?? raw?.productType,
    ),
    confidence: clampConfidence(raw?.confidence),
    manual_review_flags: flagsFrom(raw?.manual_review_flags ?? raw?.flags),
    evidence_summary: normalizeNullableText(raw?.evidence_summary),
  });
}

export function normalizeApplianceIdentity(
  extracted: RawExtractedIdentity,
): ModelIdentity {
  const flags = [...extracted.manual_review_flags];
  const normalizedModel = normalizeIdentityModel(extracted.raw_model);

  if (!normalizedModel) {
    flags.push("missing_model");
  }

  return modelIdentitySchema.parse({
    brand: extracted.raw_brand,
    normalized_model: normalizedModel,
    product_type: extracted.raw_product_type,
    serial: extracted.raw_serial,
    confidence: extracted.confidence,
    manual_review_flags: [...new Set(flags)],
    evidence_summary: extracted.evidence_summary,
  });
}

export async function extractApplianceIdentity(input: {
  files: IdentityEvidenceFile[];
  userHints?: IdentityUserHints;
  evidenceText?: string | string[];
}): Promise<{
  raw: RawExtractedIdentity;
  evidenceText: string | null;
}> {
  const evidenceText = buildIdentityEvidenceText({
    userHints: input.userHints,
    evidenceText: input.evidenceText,
  });

  if (input.files.length === 0 && input.userHints?.model && !input.evidenceText) {
    const raw = extractedIdentitySchema.parse({
      raw_brand: input.userHints.brand || null,
      raw_model: input.userHints.model,
      raw_serial: input.userHints.serial || null,
      raw_product_type: input.userHints.productType || null,
      confidence: 1,
      manual_review_flags: [],
      evidence_summary: "Operator-provided identity fields.",
    });

    return { raw, evidenceText: evidenceText || null };
  }

  const { runStructuredJson } = await import("../services/model-runner");
  const raw = await runStructuredJson<any>({
    systemInstruction: IDENTITY_EXTRACTION_PROMPT,
    files: input.files,
    prompt: evidenceText || "Perform identity extraction from provided evidence.",
  });

  return {
    raw: coerceRawIdentity(raw),
    evidenceText: evidenceText || null,
  };
}

export async function runIdentityExtractor(input: {
  files: IdentityEvidenceFile[];
  userHints?: IdentityUserHints;
  evidenceText?: string | string[];
}): Promise<IdentityExtractionResult> {
  const extracted = await extractApplianceIdentity(input);
  const modelIdentity = normalizeApplianceIdentity(extracted.raw);

  return {
    ...modelIdentity,
    model: modelIdentity.normalized_model,
    productType: modelIdentity.product_type,
    model_identity: modelIdentity,
    raw_extracted_identity: extracted.raw,
    evidence_text: extracted.evidenceText,
  };
}
