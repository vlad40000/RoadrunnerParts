import { identityExtractionPrompt, identityNormalizationPrompt } from '../prompts/identity';
import { runStructuredJson } from '../services/model-runner';
import { logger } from '@/lib/logger';
import { 
  normalizedIdentitySchema, 
  stage1OutputSchema, 
  stage2OutputSchema, 
  type Stage1Output,
  type Stage2Output
} from '../schemas/bom';

type IdentityFile = {
  mimeType: string;
  data?: string;
  uri?: string;
};

const BRAND_ALIAS_MAP = `
Whirlpool Corp. -> WHIRLPOOL
Maytag -> MAYTAG
KitchenAid -> KITCHENAID
Amana -> AMANA
Jenn-Air -> JENNAIR
Roper -> ROPER
Estate -> ESTATE
Admiral -> ADMIRAL
Magic Chef -> MAGICCHEF
Crosley -> CROSLEY
Inglis -> INGLIS
Samsung -> SAMSUNG
LG -> LG
General Electric, GE -> GE
Frigidaire, Electrolux -> ELECTROLUX
Kenmore -> KENMORE
`.trim();

const OEM_REGEX_RULES = `
WHIRLPOOL, MAYTAG, KITCHENAID, AMANA, JENNAIR: ^[A-Z0-9]{5,15}$
GE: ^[A-Z]{1,3}[0-9]{4,10}[A-Z0-9]*$
SAMSUNG: ^[A-Z]{2}[0-9]{2}[A-Z0-9]+$
LG: ^[A-Z]{3}[0-9]{4,8}[A-Z0-9]*$
ELECTROLUX: ^[A-Z]{1,2}[0-9]{6,12}$
`.trim();

function parseMaybeStringifiedJson(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return parseMaybeStringifiedJson(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(parseMaybeStringifiedJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        parseMaybeStringifiedJson(entry),
      ]),
    );
  }

  return value;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function failedStage1Output(rawText = "", reason = "identity_extraction_schema_validation_failed"): Stage1Output {
  return stage1OutputSchema.parse({
    status: "failed",
    raw_text: rawText,
    candidate_identity: {
      brand: null,
      model: null,
      serial: null,
      type_code: null,
      product_type: null,
      appliance_type: null,
      fuel_type: null,
      voltage_or_power_clues: [],
      wire_connection: null,
    },
    evidence_used: [],
    manual_review_flags: [reason],
  });
}

function failedStage2Output(reason: string): Stage2Output {
  return stage2OutputSchema.parse({
    brand: null,
    resolved_oem_brand: null,
    manufacturer_family: null,
    model: null,
    serial: null,
    type_code: null,
    appliance_type: null,
    fuel_type: null,
    status: "failed",
    expectedPartCount: undefined,
    manual_review_flags: [reason],
    normalization_status: "failed",
    evidence: [],
    blockers: [],
    next_action: null,
  });
}

/**
 * STAGE 1: Identity Extraction
 */
export async function runIdentityExtraction({
  files = [],
  userHints = {},
}: {
  files?: IdentityFile[];
  userHints?: Record<string, unknown>;
}): Promise<Stage1Output> {
  const inputText = JSON.stringify({ userHints });
  const prompt = identityExtractionPrompt.replace('{{raw_text}}', inputText);

  const rawResult = await runStructuredJson<any>({
    model: "lite",
    prompt,
    text: `INPUT:\n${inputText}`,
    files,
    temperature: 1.0,
    responseSchema: {
      type: "object",
      properties: {
        candidate_identity: {
          type: "object",
          properties: {
            brand: { type: "string", nullable: true },
            model: { type: "string", nullable: true },
            serial: { type: "string", nullable: true },
            type_code: { type: "string", nullable: true },
            product_type: { type: "string", nullable: true },
            appliance_type: { type: "string", nullable: true },
            fuel_type: { type: "string", nullable: true },
          }
        },
        confidence: { type: "object", properties: { model: { type: "number" } } },
        evidence_used: { type: "array", items: { type: "string" } },
        manual_review_flags: { type: "array", items: { type: "string" } },
      }
    }
  });

  const parsedResult = asRecord(parseMaybeStringifiedJson(rawResult));
  logger.info("Identity Extraction Result:", parsedResult);

  const parsed = stage1OutputSchema.safeParse({ 
    ...parsedResult, 
    status: parsedResult.candidate_identity?.model ? "complete" : "failed",
    raw_text: parsedResult.raw_text || ""
  });

  if (!parsed.success) {
    logger.error("Stage 1 Output parsing failed:", parsed.error.flatten());
    return failedStage1Output(String(parsedResult.raw_text || ""), "Parse error in stage 1 output");
  }

  return parsed.data;
}

/**
 * STAGE 2: Identity Normalization
 */
export async function runIdentityNormalization(extractionResult: Stage1Output): Promise<Stage2Output> {
  if (extractionResult.status === "failed") {
    return failedStage2Output("identity_extraction_failed");
  }

  const stage1Payload = JSON.stringify(extractionResult.candidate_identity, null, 2);
  
  const prompt = identityNormalizationPrompt
    .replace('{{brand_alias_map}}', BRAND_ALIAS_MAP)
    .replace('{{oem_regex_rules}}', OEM_REGEX_RULES)
    .replace('{{stage_1_output}}', stage1Payload);

  try {
    const rawResult = await runStructuredJson<any>({
      model: "lite",
      prompt,
      text: `INPUT:\n${stage1Payload}`,
      temperature: 1.0,
      responseSchema: {
        type: "object",
        properties: {
          brand: { type: "string", nullable: true },
          resolved_oem_brand: { type: "string", nullable: true },
          manufacturer_family: { type: "string", nullable: true },
          model: { type: "string", nullable: true },
          serial: { type: "string", nullable: true },
          type_code: { type: "string", nullable: true },
          appliance_type: { type: "string", nullable: true },
          fuel_type: { type: "string", nullable: true },
          expectedPartCount: { type: "number", nullable: true },
          normalization_status: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          blockers: { type: "array", items: { type: "string" } },
        }
      }
    });

    const parsedResult = parseMaybeStringifiedJson(rawResult);

    const parseAttempt = normalizedIdentitySchema.safeParse(parsedResult);
    if (!parseAttempt.success) {
      logger.error("Identity Normalization parsing failed:", parseAttempt.error.flatten());
      return failedStage2Output("Parse error in normalization output");
    }
    
    logger.info("Identity Normalized:", parseAttempt.data);
    return stage2OutputSchema.parse({ ...parseAttempt.data, status: "success" });
  } catch (err) {
    logger.error("Identity Normalization failed:", err);
    return failedStage2Output("Exception during normalization");
  }
}

/**
 * Legacy compatibility or combined runner
 */
export async function runIdentityExtractor(input: {
  files?: IdentityFile[];
  userHints?: Record<string, unknown>;
}) {
  const extraction = await runIdentityExtraction(input);
  const normalization = await runIdentityNormalization(extraction);
  
  return {
    ...normalization,
    rawText: extraction.raw_text,
    productType: normalization.manufacturer_family,
  };
}
