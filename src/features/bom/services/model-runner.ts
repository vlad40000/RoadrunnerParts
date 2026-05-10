import "server-only";
import { GoogleGenerativeAI, type FunctionDeclaration } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

export type ModelRunToolConfig = {
  functionCallingMode?: "AUTO" | "ANY" | "NONE" | "VALIDATED";
  allowedFunctionNames?: string[];
};

export type GeminiModelId =
  | "gemini-3.1-flash-lite-preview"
  | "gemini-3-flash-preview";

export type ModelAlias = "fast" | "pro" | "lite";

export type ModelRunInput = {
  model?: GeminiModelId | ModelAlias;
  prompt: string;
  files?: Array<{
    mimeType: string;
    uri?: string;
    data?: string; // Optional base64 data
  }>;
  text?: string;
  enableSearch?: boolean;
  enableUrlContext?: boolean;
  enableFunctionCalling?: boolean;
  urlContextUrls?: string[];
  functionDeclarations?: FunctionDeclaration[];
  toolConfig?: ModelRunToolConfig;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json" | "text/plain";
  schema?: any;
};

export type TextRunResult = {
  text: string;
  functionCalls?: unknown[];
  urlContextMetadata?: unknown;
  usageMetadata?: unknown;
};

const DEFAULT_MODEL: GeminiModelId = "gemini-3.1-flash-lite-preview";

function resolveModelId(
  model: ModelRunInput["model"],
  context?: { stage?: string; reason?: string },
): GeminiModelId {
  // Legacy aliases always resolve to flash-lite
  if (!model || model === "fast" || model === "lite" || model === "pro") {
    return DEFAULT_MODEL;
  }
  // Explicit full model ID — pass through but log it so it's auditable
  const modelId = model === "gemini-3-flash-preview" ? model : DEFAULT_MODEL;

  if (modelId !== DEFAULT_MODEL) {
    console.warn(
      `[model-runner] Non-default model used: model=${modelId}` +
        (context?.stage ? ` stage=${context.stage}` : "") +
        (context?.reason ? ` reason=${context.reason}` : "") +
        " | BOM truth rules still apply: model output is not source evidence.",
    );
  }
  return modelId;
}

function buildModelTools(
  input: Pick<ModelRunInput, "enableSearch" | "enableUrlContext" | "enableFunctionCalling" | "functionDeclarations">,
) {
  const tools: Array<Record<string, unknown>> = [];
  if (input.enableSearch) tools.push({ googleSearch: {} });
  if (input.enableUrlContext) tools.push({ urlContext: {} });
  if (input.enableFunctionCalling && input.functionDeclarations?.length) {
    tools.push({ functionDeclarations: input.functionDeclarations });
  }
  return tools;
}

function buildToolConfig(input: Pick<ModelRunInput, "toolConfig" | "functionDeclarations">) {
  if (!input.toolConfig || !input.functionDeclarations?.length) return undefined;

  const config: Record<string, unknown> = {};
  if (input.toolConfig.functionCallingMode) {
    config.functionCallingConfig = {
      mode: input.toolConfig.functionCallingMode,
      allowedFunctionNames: input.toolConfig.allowedFunctionNames?.length
        ? input.toolConfig.allowedFunctionNames
        : undefined,
    };
  }

  return Object.keys(config).length ? config : undefined;
}

function urlContextText(urls: string[] | undefined) {
  const cleanUrls = Array.from(
    new Set(
      (urls || [])
        .map((url) => String(url || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);

  if (!cleanUrls.length) return "";

  return [
    "[URL CONTEXT TOOL INPUT]",
    "Use the enabled URL Context tool on these ordered URLs. Preserve order and report URL Context metadata when available.",
    ...cleanUrls.map((url, index) => `${index + 1}. ${url}`),
  ].join("\n");
}

export async function runStructuredJson<T>(
  input: ModelRunInput,
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const modelId = resolveModelId(input.model);

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: input.temperature ?? 1,
    },
    systemInstruction: input.systemInstruction,
  };

  if (input.schema) {
    modelConfig.generationConfig.responseSchema = input.schema;
  }

  const tools = buildModelTools(input);
  if (tools.length) modelConfig.tools = tools;
  const toolConfig = buildToolConfig(input);
  if (toolConfig) modelConfig.toolConfig = toolConfig;

  const model = genAI.getGenerativeModel(modelConfig);

  const parts: any[] = [{ text: input.prompt }];

  if (input.text) {
    parts.push({ text: input.text });
  }

  const urlText = input.enableUrlContext ? urlContextText(input.urlContextUrls) : "";
  if (urlText) {
    parts.push({ text: urlText });
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

export async function runTextDetailed(input: ModelRunInput): Promise<TextRunResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = resolveModelId(input.model);

  const modelConfig: any = {
    model: modelId,
    generationConfig: {
      temperature: input.temperature ?? 1,
      topP: input.topP,
      maxOutputTokens: input.maxOutputTokens,
    },
    systemInstruction: input.systemInstruction,
  };

  if (input.responseMimeType) {
    modelConfig.generationConfig.responseMimeType = input.responseMimeType;
  }

  const tools = buildModelTools(input);
  if (tools.length) modelConfig.tools = tools;
  const toolConfig = buildToolConfig(input);
  if (toolConfig) modelConfig.toolConfig = toolConfig;

  const model = genAI.getGenerativeModel(modelConfig);
  const parts: any[] = [{ text: input.prompt }];

  if (input.text) {
    parts.push({ text: input.text });
  }

  const urlText = input.enableUrlContext ? urlContextText(input.urlContextUrls) : "";
  if (urlText) {
    parts.push({ text: urlText });
  }

  if (input.files && input.files.length > 0) {
    const fileParts = await Promise.all(
      input.files.map(async (file) => {
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

  const response = result.response as any;
  return {
    text: response.text(),
    functionCalls: typeof response.functionCalls === "function" ? response.functionCalls() : undefined,
    urlContextMetadata: response.candidates?.[0]?.urlContextMetadata || null,
    usageMetadata: response.usageMetadata || null,
  };
}

export async function runText(input: ModelRunInput): Promise<string> {
  const result = await runTextDetailed(input);
  return result.text;
}

export async function runGeminiCodeExecution(input: {
  code: string;
  model?: GeminiModelId;
  context?: Record<string, unknown>;
  stage?: string;
  reason?: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelId = resolveModelId(input.model as ModelRunInput["model"], {
    stage: input.stage,
    reason: input.reason,
  });
  const response = await ai.models.generateContent({
    model: modelId,
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
