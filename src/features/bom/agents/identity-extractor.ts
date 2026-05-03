import { identitySchema, type Identity } from "../schemas/bom";
import { IDENTITY_EXTRACTION_PROMPT } from "../prompts/identity";
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

  const raw = await runStructuredJson<any>({
    model: "lite",
    systemInstruction: IDENTITY_EXTRACTION_PROMPT,
    files: passthroughFiles,
    prompt: textBlocks.join("\n\n---\n\n"),
  });

  // Robust parsing to handle stringified JSON from model
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  
  // Handle cases where the model might wrap the result in a property
  if (data && typeof data === "object" && typeof data.result === "string") {
    try {
      data = JSON.parse(data.result);
    } catch {}
  }

  const result = identitySchema.safeParse(data);
  if (!result.success) {
    console.error("Identity extraction parsing failed. Raw data:", data, "Error:", result.error);
    // Fallback or re-throw
    return identitySchema.parse(data); // This will throw the original Zod error for debugging
  }

  return result.data;
}
