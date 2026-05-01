import { diagramParseSchema, type DiagramParse } from "../schemas/bom";
import { diagramPrompt } from "../prompts/diagram";
import { runStructuredJson } from "../services/model-runner";

export async function runDiagramParser(files: Array<{ mimeType: string; uri: string }>): Promise<DiagramParse> {
  const raw = await runStructuredJson<any>({
    prompt: diagramPrompt,
    files,
    temperature: 0,
  });

  return diagramParseSchema.parse(raw);
}
