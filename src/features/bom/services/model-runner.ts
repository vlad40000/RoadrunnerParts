import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type ModelRunInput = {
  model?: "fast" | "pro" | "lite";
  prompt: string;
  files?: Array<{
    mimeType: string;
    uri?: string;
    data?: string; // Optinal base64 data
  }>;
  text?: string;
  enableSearch?: boolean;
  enableUrlContext?: boolean;
  systemInstruction?: string;
  temperature?: number;
  responseSchema?: any;
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
    input.model === "pro"
      ? process.env.GEMINI_MODEL_PRO || "gemini-3-pro-preview"
      : input.model === "lite"
      ? process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite-preview"
      : process.env.GEMINI_MODEL_FAST || "gemini-3-flash-preview";

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: input.responseSchema,
      temperature: input.temperature ?? 1.0,
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
export async function runText(
  input: ModelRunInput,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelId =
    input.model === "pro"
      ? process.env.GEMINI_MODEL_PRO || "gemini-3-pro-preview"
      : input.model === "lite"
      ? process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite-preview"
      : process.env.GEMINI_MODEL_FAST || "gemini-3-flash-preview";

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      temperature: input.temperature ?? 1.0,
    },
    systemInstruction: input.systemInstruction,
  };

  if (input.enableSearch) {
    modelConfig.tools = modelConfig.tools || [];
    modelConfig.tools.push({ googleSearch: {} });
  }

  if (input.enableUrlContext) {
    modelConfig.tools = modelConfig.tools || [];
    modelConfig.tools.push({ urlContext: {} });
  }

  const model = genAI.getGenerativeModel(modelConfig);

  const parts: any[] = [{ text: input.prompt }];

  if (input.text) {
    parts.push({ text: input.text });
  }

  if (input.files && input.files.length > 0) {
    const fileParts = await Promise.all(
      input.files.map(async (file) => {
        let base64Data = file.data;
        if (!base64Data) {
          if (!file.uri) throw new Error("File missing URI or data");
          const response = await fetch(file.uri);
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

  return result.response.text();
}
