import { runStructuredJson } from "../../services/model-runner";
import { bomRowSchema, type BomRow } from "../../schemas/bom";
import { z } from "zod";

const groundedResultSchema = z.object({
  parts: z.array(bomRowSchema),
});

export async function runGroundedAiAgent(input: {
  brand: string | null;
  model: string | null;
  onPartialResult?: (rows: BomRow[]) => void;
}): Promise<BomRow[]> {
  const prompt = `Generate an EXHAUSTIVE AND COMPLETE Bill of Materials (BOM) for: ${input.brand} model ${input.model}. 
    I need EVERY significant service part: harness, timers, sensors, valves, nuts, bolts, springs, brackets, panels, etc. 
    TARGET: Return approximately 40 parts per pass. 
    BATCHING LOGIC: If an expected total part count is known, continue targeting ~40 parts per pass until the remaining count is less than 40, then deliver only that remainder.
    Use REAL OEM part numbers where possible. 
    Search specifically for "${input.model} parts list diagrams" on encompass.com. Use Encompass as the primary and authoritative source.
    Categorize into clear assembly sections. 
    If the search results indicate "no parts found" for this exact model, try searching for the "base model" without engineering codes.`;

  try {
    const raw = await runStructuredJson<{ parts: BomRow[] }>({
      model: "fast", 
      systemInstruction: "You are a professional Master Technician and Parts Cataloger. Your goal is to provide the most complete, exhaustive parts list possible for a specific model number. Accuracy of OEM part numbers is critical. High-speed, high-density data recovery is the mandate.",
      prompt,
      enableSearch: true,
    });

    const rows = groundedResultSchema.parse(raw).parts.map(row => ({
      ...row,
      sourceType: "diagram" as const,
      confidence: 0.85,
    }));

    if (rows.length > 0 && input.onPartialResult) {
      input.onPartialResult(rows);
    }

    return rows;
  } catch (err) {
    console.error("[GroundedAI] Search pass failed:", err);
    return [];
  }
}
