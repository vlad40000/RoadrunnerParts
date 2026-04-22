import { identitySchema, type Identity } from "../schemas/bom";
import { identityPrompt } from "../prompts/identity";
import { runStructuredJson } from "../services/model-runner";

export async function runIdentityExtractor(input: {
  files: Array<{ mimeType: string; uri?: string; data?: string }>;
  userHints?: { brand?: string; model?: string; serial?: string; productType?: string };
}): Promise<Identity> {
  if (input.files.length === 0 && input.userHints?.model) {
    return {
      brand: input.userHints.brand || null,
      model: input.userHints.model,
      serial: input.userHints.serial || null,
      productType: input.userHints.productType || null,
      alternates: [],
      confidence: 1.0,
    };
  }

  const passthroughFiles: Array<{ mimeType: string; uri?: string; data?: string }> = [];
  const textBlocks: string[] = [];

  if (input.userHints) {
    textBlocks.push(`USER_HINTS\n${JSON.stringify(input.userHints, null, 2)}`);
  }

  for (const file of input.files) {
    // Disabled PDF processing to remove DOMMatrix/pdfjs-dist dependency on the server
    passthroughFiles.push(file);
  }

  const raw = await runStructuredJson<Identity>({
    prompt: identityPrompt,
    files: passthroughFiles,
    text: textBlocks.join("\n\n---\n\n"),
  });

  return identitySchema.parse(raw);
}
