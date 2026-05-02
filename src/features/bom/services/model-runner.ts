import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type ModelRunInput = {
  model?: "fast" | "pro";
  prompt: string;
  files?: Array<{
    mimeType: string;
    uri?: string;
    data?: string; // Optinal base64 data
  }>;
  text?: string;
  enableSearch?: boolean;
  systemInstruction?: string;
};

export async function runStructuredJson<T>(
  input: ModelRunInput,
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelId =
    input.model === "pro" ? "gemini-3-pro" : "gemini-3-flash-preview";

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 1,
    },
    systemInstruction: input.systemInstruction,
  };

  if (input.enableSearch) {
    modelConfig.tools = [{ googleSearch: {} }];
  }

  const model = genAI.getGenerativeModel(modelConfig);

  const parts: any[] = [{ text: input.prompt }];

  if (input.text) {
    parts.push({ text: input.text });
  }

  if (input.files && input.files.length > 0) {
    const fileParts = await Promise.all(
      input.files.map(async (file) => {
        // Use direct base64 data if provided, otherwise fetch from URI
        let base64Data = file.data;

        if (!base64Data) {
          if (!file.uri) {
            throw new Error("File must have either a 'data' (base64) or 'uri' property");
          }
          const response = await fetch(file.uri);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${file.uri}`);
          }

          const buffer = await response.arrayBuffer();
          base64Data = Buffer.from(buffer).toString("base64");
        }

        return {
          inlineData: {
            mimeType: file.mimeType,
            data: base64Data,
          },
        };
      }),
    );

    parts.push(...fileParts);
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

  const responseText = result.response.text();

  try {
    return JSON.parse(responseText) as T;
  } catch {
    console.error("Gemini JSON Parse Error. Raw response:", responseText);
    throw new Error("Model returned invalid JSON");
  }
}
