import { identityExtractionPrompt, identityNormalizationPrompt } from '../prompts/identity';
import { runStructuredJson } from '../services/model-runner';
import { logger } from '@/lib/logger';
import { 
  normalizedIdentitySchema, 
  stage1OutputSchema, 
  stage2OutputSchema, 
  type NormalizedIdentity,
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

  const result = await runStructuredJson<any>({
    prompt,
    text: `INPUT:\n${inputText}`,
    files,
    temperature: 0,
  });

  logger.info("Identity Extraction Result:", result);
  
  const status = result.candidate_identity?.model ? "complete" : "failed";
  return stage1OutputSchema.parse({ 
    ...result, 
    status,
    raw_text: result.raw_text || ""
  });
}

/**
 * STAGE 2: Identity Normalization
 */
export async function runIdentityNormalization(extractionResult: Stage1Output): Promise<Stage2Output> {
  if (extractionResult.status === "failed") {
    return stage2OutputSchema.parse({ 
      brand: null, 
      resolved_oem_brand: null,
      manufacturer_family: null,
      model: null, 
      serial: null,
      type_code: null,
      appliance_type: null,
      fuel_type: null,
      status: "failed" 
    });
  }

  const stage1Payload = JSON.stringify(extractionResult.candidate_identity, null, 2);
  
  const prompt = identityNormalizationPrompt
    .replace('{{brand_alias_map}}', BRAND_ALIAS_MAP)
    .replace('{{oem_regex_rules}}', OEM_REGEX_RULES)
    .replace('{{stage_1_output}}', stage1Payload);

  try {
    const result = await runStructuredJson<any>({
      prompt,
      text: `INPUT:\n${stage1Payload}`,
      temperature: 0,
    });

    const validated = normalizedIdentitySchema.parse(result);
    logger.info("Identity Normalized:", validated);
    return stage2OutputSchema.parse({ ...validated, status: "success" });
  } catch (err) {
    logger.error("Identity Normalization failed:", err);
    return stage2OutputSchema.parse({ 
      brand: null, 
      resolved_oem_brand: null,
      manufacturer_family: null,
      model: null, 
      serial: null,
      type_code: null,
      appliance_type: null,
      fuel_type: null,
      status: "failed" 
    });
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

