import { bomRowSchema, type BomRow } from '../schemas/bom';
import { buildGroundedSynthesisPrompt } from '../prompts/parts';
import { runStructuredJson } from '../services/model-runner';
import { z } from 'zod';

const synthesisResultSchema = z.object({
  rows: z.array(bomRowSchema),
  summary: z.string().optional(),
  manual_review_flags: z.array(z.string()).optional(),
});

export async function runGroundedSynthesizer(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
  applianceType?: string | null;
  fuelType?: string | null;
  diagramFiles?: Array<{ mimeType: string; uri: string }>;
}): Promise<{ rows: BomRow[]; summary?: string }> {
  const prompt = buildGroundedSynthesisPrompt({
    model: input.model || 'UNKNOWN',
    applianceType: input.applianceType || input.productType || null,
    fuelType: input.fuelType || null,
  });

  const result = await runStructuredJson<any>({
    prompt,
    text: `INPUT:\n${JSON.stringify({
      brand: input.brand,
      model: input.model,
      applianceType: input.applianceType || input.productType,
      fuelType: input.fuelType,
    })}`,
    enableSearch: true,
    files: input.diagramFiles,
    temperature: 1.0,
  });

  const parsed = synthesisResultSchema.parse(result);

  return {
    rows: parsed.rows.map((row) => ({
      ...row,
      confidence: row.confidence ?? 1.0,
    })),
    summary: parsed.summary,
  };
}

