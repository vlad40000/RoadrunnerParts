import { NextRequest, NextResponse } from "next/server";
import { runText } from "@/src/features/bom/services/model-runner";
import {
  DEFAULT_MODEL_SLOTS,
  type ModelSlot,
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSlot(value: unknown, fallback: ModelSlot): ModelSlot {
  const input = asRecord(value);
  const modelName =
    input.modelName === "gemini-3-pro-preview"
      ? "gemini-3-pro-preview"
      : "gemini-3-flash-preview";
  const provider =
    input.provider === "manual" || input.provider === "mock" ? input.provider : "gemini";
  const temperature = Number(input.temperature);
  const topP = Number(input.topP);
  const maxOutputTokens = Number(input.maxOutputTokens);

  return {
    id: fallback.id,
    modelName,
    provider,
    enabled: input.enabled !== false,
    temperature: Number.isFinite(temperature) ? temperature : 1,
    topP: Number.isFinite(topP) ? topP : 0.8,
    maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : 8192,
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
}): Promise<PromptRunOutput> {
  const startedAt = Date.now();
  const shouldMock = input.slot.provider !== "gemini" || !process.env.GEMINI_API_KEY;
  const rawOutput = shouldMock
    ? mockOutputFor({
        scenario: input.scenario,
        slot: input.slot,
        inputPayload: input.inputPayload,
        reason: input.slot.provider !== "gemini" ? `${input.slot.provider} provider selected` : "GEMINI_API_KEY is not configured",
      })
    : await runText({
        model: input.slot.modelName,
        systemInstruction: input.scenario.systemPrompt,
        prompt: renderUserPrompt(input.scenario.userPromptTemplate, input.inputPayload),
        temperature: input.slot.temperature ?? 1,
      });

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
        }),
      ),
    );

    const run: PromptRun = {
      id: runId,
      scenarioId: scenario.id,
      scenarioType: scenario.type,
      scenarioName: scenario.name,
      inputPayload,
      modelSlots: slots,
      outputs,
      status: "complete",
      error: null,
      createdAt: new Date().toISOString(),
    };

    savePromptRun(run);

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
