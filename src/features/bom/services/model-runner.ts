import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

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
  systemInstruction?: string;
  temperature?: number;
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
      ? "gemini-3-pro-preview"
      : input.model === "lite"
        ? "gemini-3.1-flash-lite-preview"
        : "gemini-3-flash-preview";

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: input.temperature ?? 1,
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

export async function runText(input: ModelRunInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId =
    input.model === "pro"
      ? "gemini-3-pro-preview"
      : input.model === "lite"
        ? "gemini-3.1-flash-lite-preview"
        : "gemini-3-flash-preview";

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      temperature: input.temperature ?? 1,
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

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
  });

  return result.response.text();
}

export async function runGeminiCodeExecution(input: {
  code: string;
  model?: "gemini-3-flash-preview" | "gemini-3-pro-preview";
  context?: Record<string, unknown>;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: input.model || "gemini-3-flash-preview",
    contents: [
      "Run this operator-supplied Python/code-execution block for preflight validation.",
      "If the block is an SDK request template that cannot run inside the code sandbox, validate the configuration and report that it is a template rather than executable evidence.",
      "Do not create final BOM truth. Return only execution output, validation notes, and any tool/code results.",
      `Context JSON:\n${JSON.stringify(input.context || {}, null, 2)}`,
      `Code:\n${input.code}`,
    ].join("\n\n"),
    config: {
      temperature: 1,
      tools: [{ codeExecution: {} }],
    },
  } as any);

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  return {
    text: response.text || "",
    executableCode: parts
      .map((part: any) => part.executableCode?.code || "")
      .filter(Boolean),
    codeExecutionResult: parts
      .map((part: any) => part.codeExecutionResult || null)
      .filter(Boolean),
    usageMetadata: response.usageMetadata || null,
  };
}
