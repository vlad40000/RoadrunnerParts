import { generateBOM } from "../../../lib/gemini";
import { db } from "../../../server/db";
import { modelSources } from "../../../server/db/schema/model-sources";
import { normalizeModelKey } from "./model-parts-cache";

export async function generateAiBom(input: {
  model: string;
  brand?: string | null;
  serial?: string | null;
  manufactureDate?: string | null;
  passNumber?: number;
  isExhaustive?: boolean;
  knownPartNumbers?: string[];
  expectedPartCount?: number | null;
}) {
  const { 
    model, 
    brand, 
    serial, 
    manufactureDate, 
    passNumber = 1, 
    isExhaustive = false, 
    knownPartNumbers = [],
    expectedPartCount = null 
  } = input;
  
  const normalizedModel = normalizeModelKey(model);
  const query = `${brand ? brand + ' ' : ''}${model}`;

  console.log(`[BOM AI Service] Generating AI BOM for ${normalizedModel} (Pass ${passNumber})...`);

  // Call the centralized LLM wrapper
  const result = await generateBOM({
    query,
    serial: serial || undefined,
    manufactureDate: manufactureDate || undefined,
    passNumber,
    isExhaustive,
    existingPartNumbers: knownPartNumbers
  });

  // DB-FIRST: Log the raw LLM interaction to model_sources
  // This ensures the King's "Visual Truth" is always preserved.
  await db.insert(modelSources).values({
    normalizedModel,
    source: 'gemini-3-flash-preview',
    sourceUrl: 'ai-generation',
    urlType: 'ai',
    raw: { 
      input: { query, serial, manufactureDate, passNumber, isExhaustive, knownPartNumbers },
      output: result 
    },
    status: 'success',
    expectedPartCount: expectedPartCount || result.parts?.length || 0
  }).catch(err => console.error('[BOM AI Service] Failed to log to model_sources:', err));

  return result;
}
