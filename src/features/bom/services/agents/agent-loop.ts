import { GoogleGenerativeAI, FunctionDeclaration, Tool, FunctionCall } from "@google/generative-ai";
import { runText, ModelRunInput } from "../model-runner";

export type AgentStage = 
  | "ocr_ingest"
  | "cache_check"
  | "source_resolution"
  | "parts_extraction"
  | "market_lookup"
  | "final_audit";

export interface AgentConfig {
  stage: AgentStage;
  systemInstruction: string;
  tools: FunctionDeclaration[];
  mode?: "AUTO" | "ANY" | "NONE";
}

export async function runAgentLoop(input: {
  config: AgentConfig;
  prompt: string;
  imageFiles?: any[];
  dispatcher: (call: FunctionCall) => Promise<any>;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  // Default to pro for complex orchestration, otherwise follow policy
  const modelId = input.config.stage === "cache_check" || input.config.stage === "ocr_ingest" 
    ? (process.env.GEMINI_MODEL_FAST || "gemini-3-flash-preview")
    : (process.env.GEMINI_MODEL_PRO || "gemini-3-pro-preview");

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: input.config.systemInstruction,
    generationConfig: {
      temperature: 1.0, // No temperature 0
    },
    tools: [{ functionDeclarations: input.config.tools }],
    toolConfig: input.config.mode ? {
      functionCallingConfig: {
        mode: input.config.mode as any
      }
    } : undefined
  });

  const chat = model.startChat();
  let currentPrompt: any = { role: "user", parts: [{ text: input.prompt }] };

  if (input.imageFiles && input.imageFiles.length > 0) {
     // Handle inline image data if provided
     currentPrompt.parts.push(...input.imageFiles);
  }

  let result = await chat.sendMessage(currentPrompt.parts);
  
  // Maximum loop depth to prevent infinite loops
  let depth = 0;
  const maxDepth = 15;

  while (depth < maxDepth) {
    const call = result.response.functionCalls()?.[0];
    if (!call) break;

    console.log(`[Agent: ${input.config.stage}] Tool Call: ${call.name}`, call.args);

    const toolResult = await input.dispatcher(call);
    
    result = await chat.sendMessage([{
      functionResponse: {
        name: call.name,
        response: toolResult
      }
    }]);

    depth++;
  }

  return result.response.text();
}
