import { IDENTITY_EXTRACTION_PROMPT } from '../prompts/identity';
import { runStructuredJson } from '../services/model-runner';
import { logger } from '@/lib/logger';
import { 
  normalizedIdentitySchema, 
  stage1OutputSchema, 
  stage2OutputSchema, 
  type Stage1Output,
  type Stage2Output
} from '../schemas/bom';
import { logTelemetry } from '../services/telemetry';

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
      appliance_type: null,
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
    appliance_type: null,
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
 * STAGE 1: Identity Extraction & JS Normalization
 */
export async function runIdentityExtractor({
  files = [],
  userHints = {},
  jobId,
}: {
  files?: IdentityFile[];
  userHints?: Record<string, unknown>;
  jobId?: string;
}): Promise<Stage2Output> {
  const inputText = JSON.stringify({ userHints });
  
  const startTime = Date.now();
  
  let rawResult;
  try {
    rawResult = await runStructuredJson<any>({
      model: "lite",
      prompt: IDENTITY_EXTRACTION_PROMPT,
      text: `INPUT:\n${inputText}`,
      files,
      temperature: 1.0,
    });
  } catch (err) {
    await logTelemetry({
      jobId,
      event: "identity_extraction_attempt",
      status: "failed",
      payload: {
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      }
    });
    throw err;
  }

  const parsedResult = asRecord(parseMaybeStringifiedJson(rawResult));
  logger.info("Identity Extraction Result:", parsedResult);

  const candidate = parsedResult.candidate_identity || {};
  const rawModel = String(candidate.model || "").trim();
  const status = (parsedResult.status || (rawModel ? "complete" : "failed")) as "complete" | "success" | "failed";

  await logTelemetry({
    jobId,
    event: "identity_extraction_result",
    status: status === "failed" ? "failed" : "success",
    model: rawModel || null,
    brand: candidate.brand || null,
    payload: {
      duration: Date.now() - startTime,
      evidence_count: (parsedResult.evidence_used as any[])?.length || 0,
      manual_review_flags: parsedResult.manual_review_flags || [],
    }
  });

  return stage2OutputSchema.parse({
    brand: null,
    resolved_oem_brand: null,
    manufacturer_family: null,
    model: rawModel || null,
    serial: candidate.serial || null,
    appliance_type: null,
    status: status === "complete" ? "success" : status,
    normalization_status: status === "complete" ? "complete" : "failed",
    evidence: parsedResult.evidence_used || [],
    blockers: status === "failed" ? ["identity_not_found"] : [],
    next_action: null,
  });
}

/**
 * Legacy compatibility
 */
export async function runIdentityExtraction(input: any): Promise<any> {
  const result = await runIdentityExtractor(input);
  // Return an object that satisfies Stage1Output expectations
  return {
    ...result,
    status: result.status === "success" ? "complete" : "failed",
    raw_text: result.evidence.join("\n"),
    candidate_identity: {
      brand: result.brand,
      model: result.model,
      serial: result.serial,
      appliance_type: result.appliance_type,
    },
    evidence_used: result.evidence,
  };
}

export async function runIdentityNormalization(extractionResult: any): Promise<any> {
  // If it's already normalized (from our new shim), just return it
  if (extractionResult.normalization_status) {
    return extractionResult;
  }
  return extractionResult;
}
