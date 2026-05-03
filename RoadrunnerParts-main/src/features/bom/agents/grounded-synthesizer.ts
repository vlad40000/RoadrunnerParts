import { bomRowSchema, type BomRow } from "../schemas/bom";
import { runStructuredJson } from "../services/model-runner";
import { z } from "zod";

const synthesisResultSchema = z.object({
  rows: z.array(bomRowSchema),
  summary: z.string().optional(),
});

export async function runGroundedSynthesizer(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
  diagramFiles?: Array<{ mimeType: string; uri: string }>;
}): Promise<{ rows: BomRow[]; summary?: string }> {
  const modelStr = `${input.brand || ""} ${input.model || ""}`.trim();

  const prompt = `
You are a Senior Appliance Parts Specialist. 
Your objective is to generate a COMPLETE, granular Bill of Materials (BOM) for: ${modelStr}

INSTRUCTIONS:
1. Use GOOGLE SEARCH to locate official engineering diagrams and parts lists on encompass.com for this EXACT model (revision matters).
2. Encompass is the primary source. Only use other manufacturer-authorized portals if specifically directed or if Encompass has zero records for this model.
3. Recover EVERY line item including major assemblies, electronics, and especially "the nuts and bolts" (screws, clips, washers, fasteners).
4. TARGET: Return approximately 40 parts per pass. 
5. BATCHING LOGIC: If an expected total part count is provided or known, continue targeting ~40 parts per pass until the remaining count is less than 40, then deliver only that remainder.
6. Do not summarize. If a machine has 100+ individual part entries in the catalog, extract all of them using this multi-pass approach if necessary.
7. Identify the correct Diagram Section for each part (e.g., "Top & Cabinet", "Gearcase & Motor").

DATA SCHEMA:
{
  "rows": [
    {
      "section": "Assembly Name",
      "diagramNumber": "Ref # or Item #",
      "description": "Full Part Description",
      "originalPartNumber": "OEM Number",
      "currentServicePartNumber": "Replaced By/Current Number",
      "nlaStatus": boolean,
      "replacementNote": "Any substitution info"
    }
  ],
  "summary": "Brief analysis of count and coverage"
}

STRICT JSON ONLY. NO OTHER TEXT.
`.trim();

  const result = await runStructuredJson<{ rows: BomRow[]; summary?: string }>({
    prompt,
    enableSearch: true, // TRIGGER GOOGLE SEARCH GROUNDING
    files: input.diagramFiles, // Pass diagrams if user provided them
  });

  const parsed = synthesisResultSchema.parse(result);

  return {
    rows: parsed.rows.map(r => ({ ...r, confidence: 1.0 })),
    summary: parsed.summary
  };
}
