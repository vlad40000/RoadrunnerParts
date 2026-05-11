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

  const data = await runStructuredJson<any>({
    model: "lite",
    systemInstruction: IDENTITY_EXTRACTION_PROMPT,
    files: passthroughFiles,
    prompt: textBlocks.join("\n\n---\n\n"),
    schema: {
      type: "object",
      properties: {
        brand: { type: "string", nullable: true },
        model: { type: "string", nullable: true },
        serial: { type: "string", nullable: true },
        productType: { type: "string", nullable: true },
        alternates: { type: "array", items: { type: "string" } },
        confidence: { type: "number" }
      },
      required: ["brand", "model", "serial", "productType", "alternates", "confidence"]
    }
  });

  const result = identitySchema.safeParse(data);
  if (!result.success) {
    console.error("Identity extraction parsing failed. Raw data:", data, "Error:", result.error);
    throw new Error(`Identity extraction failed validation: ${result.error.message}`);
  }

  return result.data;
}
