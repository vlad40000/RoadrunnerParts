import { diagramParseSchema, type DiagramParse } from "../schemas/bom";
import { DIAGRAM_PARSER_PROMPT } from "../prompts/engine";
import { runStructuredJson } from "../services/model-runner";

export async function runDiagramParser(files: Array<{ mimeType: string; uri: string }>): Promise<DiagramParse> {
  const raw = await runStructuredJson<any>({
    prompt: DIAGRAM_PARSER_PROMPT,
    // Removed files per policy (no pictures)
    temperature: 1.0,
  });

  return diagramParseSchema.parse(raw);
}
