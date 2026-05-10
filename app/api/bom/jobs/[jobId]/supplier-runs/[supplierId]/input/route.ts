import { NextRequest, NextResponse } from "next/server";
import {
  getBomJob,
  getBomSupplierRun,
  saveBomSupplierRunInput,
} from "@/features/bom/services/job-store";
import { normalizeSupplierId } from "@/features/bom/services/source-tier-policy";

type Params = { params: Promise<{ jobId: string; supplierId: string }> };
type GeminiModel =
  | "gemini-3.1-flash-lite-preview"
  | "gemini-3-flash-preview";

function positiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeModel(value: unknown): GeminiModel {
  if (value === "gemini-3-flash-preview") return "gemini-3-flash-preview";
  if (value === "gemini-3.1-flash-lite-preview") return "gemini-3.1-flash-lite-preview";
  return "gemini-3.1-flash-lite-preview";
}

function normalizeTemperature(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : 1;
}

function normalizeThinking(value: unknown) {
  const normalized = String(value || "medium").trim().toLowerCase();
  return normalized === "minimal" || normalized === "low" || normalized === "high" ? normalized : "medium";
}

function normalizeToolConfig(value: unknown) {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    directFetch: true,
    structuredOutput: true,
    googleSearch: input.googleSearch !== false && input.useSearch !== false,
    urlContext: input.urlContext !== false,
    codeExecution: input.codeExecution !== false && input.usePython !== false,
    functionCalling: input.functionCalling !== false,
    googleMaps: input.googleMaps !== false,
    computerUse: input.computerUse === true,
  };
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { jobId, supplierId: rawSupplierId } = await params;
  const supplierId = normalizeSupplierId(rawSupplierId);
  const body = await req.json();
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (!String(job.model || "").trim()) {
    return NextResponse.json({ ok: false, error: "Persisted model is required before supplier runs." }, { status: 400 });
  }
  const supplier = normalizeSupplierId(String(body.supplier || supplierId));
  const expectedTotal = positiveNumber(body.expectedTotal);
  const bodyTuning = (body.tuning && typeof body.tuning === "object" ? body.tuning : {}) as Record<string, unknown>;
  const toolConfig = normalizeToolConfig(body.toolConfig || bodyTuning.toolConfig || bodyTuning.tools || bodyTuning);
  const agentConfig = {
    model: normalizeModel(body.model || bodyTuning.model),
    temperature: normalizeTemperature(body.temperature ?? bodyTuning.temperature),
    thinkingLevel: normalizeThinking(body.thinkingLevel || bodyTuning.thinkingLevel),
    systemInstruction: String(body.systemInstruction || bodyTuning.systemInstruction || "").trim(),
    toolConfig,
  };

  const persistedInput = {
    task: String(body.task || "run_supplier_agent"),
    tierKey: String(body.tierKey || "tier0"),
    supplierId,
    supplier,
    sourceUrl: String(body.sourceUrl || body.searchUrl || "").trim(),
    searchUrl: String(body.searchUrl || body.sourceUrl || "").trim(),
    includeDiagram: body.includeDiagram !== false,
    includeExpectedCount: body.includeExpectedCount !== false,
    canonUrlUsed: body.canonUrl || null,
    diagramImageUrlUsed: body.diagramImageUrl || null,
    expectedTotalUsed: expectedTotal,
    expectedTotalSource: expectedTotal ? String(body.expectedTotalSource || "operator") : null,
    assemblyNamesUsed: Array.isArray(body.assemblyNames) ? body.assemblyNames : [],
    operatorInstructions: String(body.operatorInstructions || body.visualTruth?.operatorInstructions || "").trim(),
    operatorInstructionName: String(body.operatorInstructionName || body.visualTruth?.operatorInstructionName || "").trim(),
    agentCode: String(body.agentCode || "").trim(),
    agentCodeLanguage: String(body.agentCodeLanguage || "").trim(),
    agentConfig,
    modelConfig: agentConfig,
    toolConfig,
    tuning: {
      model: agentConfig.model,
      temperature: agentConfig.temperature,
      thinkingLevel: agentConfig.thinkingLevel,
      toolConfig,
    },
    normalizedModel: String(job.model || ""),
    promptVersion: body.promptVersion || "supplier-agent-matrix-v1",
    functionVersion: body.functionVersion || "supplier-run-route-v2",
    status: "input_saved",
    updatedAt: new Date().toISOString(),
  };

  await saveBomSupplierRunInput(jobId, supplierId, persistedInput);
  return NextResponse.json({ ok: true, supplierRun: await getBomSupplierRun(jobId, supplierId) });
}
