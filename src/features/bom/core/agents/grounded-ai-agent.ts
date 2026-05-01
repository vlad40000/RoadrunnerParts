import { type BomRow } from '../../schemas/bom';
import { runGroundedSynthesizer } from '../../agents/grounded-synthesizer';

export async function runGroundedAiAgent(input: {
  brand: string | null;
  model: string | null;
  applianceType?: string | null;
  fuelType?: string | null;
  onPartialResult?: (rows: BomRow[]) => void;
}): Promise<BomRow[]> {
  const result = await runGroundedSynthesizer({
    brand: input.brand,
    model: input.model,
    applianceType: input.applianceType || null,
    fuelType: input.fuelType || null,
    dbState: 'not_checked',
  });

  if (result.rows.length > 0 && input.onPartialResult) {
    input.onPartialResult(result.rows);
  }

  return result.rows;
}
