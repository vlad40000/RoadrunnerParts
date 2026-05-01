import { runStructuredJson } from "../services/model-runner";
import { z } from "zod";
import { EXECUTION_CONTRACT } from "../prompts/contract";

export const coverageResultSchema = z.object({
  found: z.boolean(),
  expectedPartsTotal: z.number().nullable(),
  matchedModel: z.string(),
  modelUrl: z.string(),
  evidence: z.string(),
  manual_review_flags: z.array(z.string()).optional(),
});

export type CoverageResult = z.infer<typeof coverageResultSchema>;

export const COVERAGE_EXTRACTION_PROMPT = `
${EXECUTION_CONTRACT}

TASK:
Identify the total parts count for the appliance model from the provided HTML snippets.

OUTPUT JSON:
{
  "found": true/false,
  "expectedPartsTotal": number,
  "matchedModel": "Model number found",
  "modelUrl": "Direct source page URL",
  "evidence": "Snippet of text providing the count",
  "manual_review_flags": []
}
`.trim();

export async function runCoverageExtractor(input: {
  modelNumber: string;
  targetUrl: string;
  htmlSnippet: string;
}): Promise<CoverageResult> {
  const raw = await runStructuredJson<any>({
    model: "fast",
    prompt: COVERAGE_EXTRACTION_PROMPT,
    text: `Target URL: ${input.targetUrl}\nModel: ${input.modelNumber}\n\nHTML PAYLOAD:\n${input.htmlSnippet}`,
    temperature: 1.0,
  });

  return coverageResultSchema.parse(raw);
}

