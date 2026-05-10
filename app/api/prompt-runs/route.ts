import { NextRequest, NextResponse } from "next/server";
import { runTextDetailed } from "@/src/features/bom/services/model-runner";
import {
  DEFAULT_MODEL_TOOLS,
  DEFAULT_MODEL_SLOTS,
  type ModelSlot,
  type ModelToolSettings,
  type PromptRun,
  type PromptRunOutput,
  type PromptScenario,
} from "@/src/features/bom/prompt-workspace/types";
import {
  getPromptScenario,
  listPromptRuns,
  savePromptRun,
} from "@/src/features/bom/prompt-workspace/server-store";
import {
  normalizeModelOutput,
  validatePromptOutput,
} from "@/src/features/bom/prompt-workspace/validation";
import { logTelemetry } from "@/src/features/bom/services/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URL_CONTEXT_URLS = 20;
type FunctionCallingMode = "AUTO" | "ANY" | "NONE" | "VALIDATED";

function normalizePromptModel(value: unknown): ModelSlot["modelName"] {
  if (value === "gemini-3-flash-preview") return "gemini-3-flash-preview";
  if (value === "gemini-3.1-flash-lite-preview") return "gemini-3.1-flash-lite-preview";
  return "gemini-3.1-flash-lite-preview";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .map((item) => ({
      name: String(item.name || "attachment").slice(0, 160),
      mimeType: String(item.mimeType || "application/octet-stream"),
      data: String(item.data || item.dataBase64 || ""),
    }))
    .filter((item) => item.data && item.mimeType);
}

function normalizeUrlItems(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return String(record.url || record.sourceUrl || record.href || "").trim();
    })
    .filter(Boolean);
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const clean = String(url || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_URL_CONTEXT_URLS) break;
  }
  return out;
}

function normalizeToolContext(value: unknown, inputPayload: Record<string, unknown>) {
  const input = asRecord(value);
  const urlContext = asRecord(input.urlContext);
  const functionCalling = asRecord(input.functionCalling);
  const urls = uniqueUrls([
    ...normalizeUrlItems(urlContext.urls),
    ...normalizeUrlItems(inputPayload.sourceUrls),
    ...normalizeUrlItems(inputPayload.candidateUrls),
    ...normalizeUrlItems(inputPayload.sourceUrl),
  ]);
  const functionDeclarations = Array.isArray(functionCalling.functionDeclarations)
    ? functionCalling.functionDeclarations.map((item) => asRecord(item)).filter((item) => item.name)
    : [];
  const allowedFunctionNames = Array.isArray(functionCalling.allowedFunctionNames)
    ? functionCalling.allowedFunctionNames.map((item) => String(item || "").trim()).filter(Boolean)
    : functionDeclarations.map((item) => String(item.name || "")).filter(Boolean);
  const requestedMode = String(functionCalling.mode || "AUTO").toUpperCase();
  const mode: FunctionCallingMode =
    requestedMode === "ANY" || requestedMode === "NONE" || requestedMode === "VALIDATED" || requestedMode === "AUTO"
      ? requestedMode
      : "AUTO";

  return {
    urlContext: {
      enabled: urlContext.enabled !== false && urls.length > 0,
      maxUrls: MAX_URL_CONTEXT_URLS,
      urls,
    },
    googleSearch: {
      enabled: asRecord(input.googleSearch).enabled !== false,
    },
    functionCalling: {
      enabled: functionCalling.enabled !== false,
      callLimit: null,
      mode,
      allowedFunctionNames,
      functionDeclarations,
    },
  };
}

function normalizeSlot(value: unknown, fallback: ModelSlot): ModelSlot {
  const input = asRecord(value);
  const toolInput = asRecord(input.tools);
  const modelName = normalizePromptModel(input.modelName);
  const provider =
    input.provider === "manual" || input.provider === "mock" ? input.provider : "gemini";
  const temperature = Number(input.temperature);
  const topP = Number(input.topP);
  const maxOutputTokens = Number(input.maxOutputTokens);
  const thinkingLevel =
    toolInput.thinkingLevel === "low" || toolInput.thinkingLevel === "medium" || toolInput.thinkingLevel === "high"
      ? toolInput.thinkingLevel
      : DEFAULT_MODEL_TOOLS.thinkingLevel;
  const mediaResolution =
    toolInput.mediaResolution === "low" || toolInput.mediaResolution === "high" || toolInput.mediaResolution === "default"
      ? toolInput.mediaResolution
      : DEFAULT_MODEL_TOOLS.mediaResolution;
  const tools: ModelToolSettings = {
    structuredOutputs: toolInput.structuredOutputs !== false,
    codeExecution: toolInput.codeExecution !== false,
    functionCalling: toolInput.functionCalling !== false,
    googleSearchGrounding: toolInput.googleSearchGrounding !== false,
    googleMapsGrounding: toolInput.googleMapsGrounding !== false,
    urlContext: toolInput.urlContext !== false,
    computerUse:
      toolInput.computerUse === true
        ? true
        : toolInput.computerUse === false
          ? false
          : DEFAULT_MODEL_TOOLS.computerUse,
    thinkingLevel,
    mediaResolution,
    stopSequence: typeof toolInput.stopSequence === "string" ? toolInput.stopSequence : "",
  };

  return {
    id: fallback.id,
    modelName,
    provider,
    enabled: input.enabled !== false,
    temperature: Number.isFinite(temperature) ? temperature : 1,
    topP: Number.isFinite(topP) ? topP : 0.8,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 8192,
    tools,
  };
}

function renderUserPrompt(template: string, inputPayload: Record<string, unknown>) {
  const inputJson = JSON.stringify(inputPayload, null, 2);
  return String(template || "")
    .replaceAll("{{input_payload_json}}", inputJson)
    .replaceAll("{{inputPayloadJson}}", inputJson);
}

function mockOutputFor(input: {
  scenario: PromptScenario;
  slot: ModelSlot;
  inputPayload: Record<string, unknown>;
  reason: string;
}) {
  return JSON.stringify(
    {
      mock: true,
      reason: input.reason,
      scenarioType: input.scenario.type,
      modelName: input.slot.modelName,
      receivedInputKeys: Object.keys(input.inputPayload),
      note: "No scraper, parser, browser automation, or source extraction was run.",
    },
    null,
    2,
  );
}

async function runSlot(input: {
  runId: string;
  scenario: PromptScenario;
  slot: ModelSlot;
  inputPayload: Record<string, unknown>;
  toolContext: ReturnType<typeof normalizeToolContext>;
  attachments: Array<{ name: string; mimeType: string; data: string }>;
}): Promise<PromptRunOutput> {
  const startedAt = Date.now();
  const shouldMock = input.slot.provider !== "gemini" || !process.env.GEMINI_API_KEY;
  const result = shouldMock
    ? mockOutputFor({
        scenario: input.scenario,
        slot: input.slot,
        inputPayload: input.inputPayload,
        reason: input.slot.provider !== "gemini" ? `${input.slot.provider} provider selected` : "GEMINI_API_KEY is not configured",
      })
    : await runTextDetailed({
        model: input.slot.modelName,
        systemInstruction: input.scenario.systemPrompt,
        prompt: renderUserPrompt(input.scenario.userPromptTemplate, input.inputPayload),
        temperature: input.slot.temperature ?? 1,
        topP: input.slot.topP,
        maxOutputTokens: input.slot.maxOutputTokens,
        enableSearch: input.slot.tools?.googleSearchGrounding,
        enableUrlContext: input.slot.tools?.urlContext,
        enableFunctionCalling: input.slot.tools?.functionCalling,
        urlContextUrls: input.toolContext.urlContext.urls,
        functionDeclarations: input.toolContext.functionCalling.functionDeclarations as any,
        toolConfig: input.toolContext.functionCalling.functionDeclarations.length
          ? {
              functionCallingMode: input.toolContext.functionCalling.mode,
              allowedFunctionNames: input.toolContext.functionCalling.allowedFunctionNames,
            }
          : undefined,
        responseMimeType: input.slot.tools?.structuredOutputs ? "application/json" : undefined,
        files: input.attachments.map((attachment) => ({
          mimeType: attachment.mimeType,
          data: attachment.data,
        })),
      });
  const runResult = typeof result === "string" ? { text: result } : result;
  const rawOutput =
    runResult.text ||
    (runResult.functionCalls?.length
      ? JSON.stringify({ functionCalls: runResult.functionCalls }, null, 2)
      : "");

  const normalized = normalizeModelOutput(rawOutput);
  const validation = validatePromptOutput({
    scenarioType: input.scenario.type,
    rawOutput,
    parsedJson: normalized.parsedJson ?? undefined,
  });
  const validationStatus =
    !normalized.parsedJson
      ? "unparsed"
      : validation.errors.length || validation.rejectedRows.length
        ? "invalid"
        : validation.warnings.length
          ? "warning"
          : "valid";

  return {
    id: crypto.randomUUID(),
    runId: input.runId,
    slotId: input.slot.id,
    modelName: input.slot.modelName,
    provider: input.slot.provider,
    rawOutput,
    parsedJson: normalized.parsedJson,
    validationStatus,
    errors: validation.errors,
    warnings: validation.warnings,
    latencyMs: Date.now() - startedAt,
    createdAt: new Date().toISOString(),
    mock: shouldMock,
    functionCalls: runResult.functionCalls,
    urlContextMetadata: runResult.urlContextMetadata,
    usageMetadata: runResult.usageMetadata,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    runs: listPromptRuns(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const scenarioId = String(body.scenarioId || "").trim();
    const scenarioBody = asRecord(body.scenario);
    const storedScenario = scenarioId ? getPromptScenario(scenarioId) : null;
    const scenario = (Object.keys(scenarioBody).length ? scenarioBody : storedScenario) as PromptScenario | null;

    if (!scenario || !scenario.id || !scenario.type) {
      return NextResponse.json({ ok: false, error: "Missing prompt scenario." }, { status: 400 });
    }

    const inputPayload = asRecord(body.inputPayload);
    const toolContext = normalizeToolContext(body.toolContext, inputPayload);
    const attachments = normalizeAttachments(body.attachments);
    const slotInputs = Array.isArray(body.modelSlots) ? body.modelSlots : DEFAULT_MODEL_SLOTS;
    const requestedEnabledSlots = slotInputs.filter((slot) => asRecord(slot).enabled !== false);
    if (requestedEnabledSlots.length > 2) {
      return NextResponse.json({ ok: false, error: "Only two model slots are allowed." }, { status: 400 });
    }

    const slots = DEFAULT_MODEL_SLOTS.map((fallback, index) => normalizeSlot(slotInputs[index], fallback));
    const activeSlots = slots.filter((slot) => slot.enabled);

    if (!activeSlots.length) {
      return NextResponse.json({ ok: false, error: "At least one model slot must be enabled." }, { status: 400 });
    }

    const runId = crypto.randomUUID();
    const outputs = await Promise.all(
      activeSlots.map((slot) =>
        runSlot({
          runId,
          scenario,
          slot,
          inputPayload,
          toolContext,
          attachments,
        }),
      ),
    );

    const run: PromptRun = {
      id: runId,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      scenarioName: scenario.name,
      inputPayload,
      toolContext,
      modelSlots: slots,
      outputs,
      status: "complete",
      error: null,
      createdAt: new Date().toISOString(),
    };

    savePromptRun(run);

    // Persist to telemetry for backend review and testing
    await logTelemetry({
      jobId: String(body.jobContext ? (body.jobContext as any).jobId : "") || undefined,
      event: `prompt_playground:${scenario.type}`,
      status: "success",
      model: String(body.jobContext ? (body.jobContext as any).model : "") || undefined,
      brand: String(body.jobContext ? (body.jobContext as any).brand : "") || undefined,
      systemPrompt: scenario.systemPrompt,
      payload: {
        runId: run.id,
        scenarioId: scenario.id,
        inputPayload,
        toolContext,
        outputs: run.outputs.map(o => ({
          slotId: o.slotId,
          latencyMs: o.latencyMs,
          validationStatus: o.validationStatus,
          functionCalls: o.functionCalls,
          urlContextMetadata: o.urlContextMetadata,
        }))
      }
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Prompt run failed",
      },
      { status: 500 },
    );
  }
}
