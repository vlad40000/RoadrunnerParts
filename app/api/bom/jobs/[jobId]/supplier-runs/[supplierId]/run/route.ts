import { NextRequest, NextResponse } from "next/server";
import {
  failBomJob,
  getBomJob,
  getBomSupplierRun,
  getBomVisualTruth,
  saveBomSupplierRunInput,
  saveBomSupplierRunResult,
  updateBomJobSummary,
} from "@/features/bom/services/job-store";
import {
  normalizeSupplierId,
  type ManualSourceActionTask,
} from "@/features/bom/services/source-tier-policy";

type Params = { params: Promise<{ jobId: string; supplierId: string }> };
type GeminiModel =
  | "gemini-3.1-flash-lite-preview"
  | "gemini-3-flash-preview";
type ThinkingLevel = "minimal" | "low" | "medium" | "high";

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

function normalizeThinking(value: unknown): ThinkingLevel {
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

function normalizeAgentConfig(input: Record<string, unknown>): {
  model: GeminiModel;
  temperature: number;
  thinkingLevel: ThinkingLevel;
  systemInstruction: string;
  toolConfig: {
    directFetch: boolean;
    structuredOutput: boolean;
    googleSearch: boolean;
    urlContext: boolean;
    codeExecution: boolean;
    functionCalling: boolean;
    googleMaps: boolean;
    computerUse: boolean;
  };
} {
  const rawAgentConfig =
    input.agentConfig && typeof input.agentConfig === "object"
      ? (input.agentConfig as Record<string, unknown>)
      : {};
  const rawTuning =
    input.tuning && typeof input.tuning === "object"
      ? (input.tuning as Record<string, unknown>)
      : {};
  const rawToolConfig =
    rawAgentConfig.toolConfig ||
    input.toolConfig ||
    rawTuning.toolConfig ||
    rawTuning.tools ||
    rawTuning;

  return {
    model: normalizeModel(rawAgentConfig.model || input.model || rawTuning.model),
    temperature: normalizeTemperature(rawAgentConfig.temperature ?? input.temperature ?? rawTuning.temperature),
    thinkingLevel: normalizeThinking(rawAgentConfig.thinkingLevel || input.thinkingLevel || rawTuning.thinkingLevel),
    systemInstruction: String(rawAgentConfig.systemInstruction || input.systemInstruction || rawTuning.systemInstruction || "").trim(),
    toolConfig: normalizeToolConfig(rawToolConfig),
  };
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { jobId, supplierId: rawSupplierId } = await params;
  const supplierId = normalizeSupplierId(rawSupplierId);
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (!String(job.model || "").trim()) {
    return NextResponse.json({ ok: false, error: "Persisted model is required before supplier runs." }, { status: 400 });
  }

  const supplierRun =
    (await getBomSupplierRun(jobId, supplierId)) ||
    (supplierId !== rawSupplierId ? await getBomSupplierRun(jobId, rawSupplierId) : null);
  const input = (supplierRun?.input as Record<string, unknown> | undefined) || null;
  if (!input) {
    return NextResponse.json({ ok: false, error: "Persisted supplier run input is required before run." }, { status: 400 });
  }

  const visualTruth = await getBomVisualTruth(jobId);
  const includeDiagram = input.includeDiagram !== false;
  if (includeDiagram) {
    const hasCanonUrl = !!String(visualTruth?.canonUrl || "").trim();
    const hasDiagramImage =
      !!String(
        visualTruth?.storedImageUrl ||
          visualTruth?.base64 ||
          visualTruth?.screenshotBase64 ||
          "",
      ).trim();
    if (!hasCanonUrl || !hasDiagramImage) {
      return NextResponse.json(
        { ok: false, error: "Persisted Visual Truth image and canonUrl are required for diagram-context runs." },
        { status: 400 },
      );
    }
  }
  const supplier = normalizeSupplierId(String(input.supplier || supplierId));
  const task = String(input.task || "run_supplier_agent") as ManualSourceActionTask;
  const agentConfig = normalizeAgentConfig(input);
  const expectedTotalSource = String(input.expectedTotalSource || "");
  const inputExpectedTotal = positiveNumber(input.expectedTotalUsed ?? input.expectedTotal);
  const expectedTotal =
    input.includeExpectedCount !== false
      ? positiveNumber(visualTruth?.expectedTotal) ??
        (expectedTotalSource === "operator" || expectedTotalSource === "visual_truth"
          ? inputExpectedTotal
          : null)
      : null;

  const runningInput = {
    ...input,
    task,
    supplierId,
    supplier,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await saveBomSupplierRunInput(jobId, supplierId, runningInput);
  await updateBomJobSummary(jobId, {
    jobStage: `supplier_run_${supplierId}_running`,
    sourceStrategy: `manual-distributor-control:${String(input.tierKey || "tier0")}:${supplier}:${task}`,
    bomComplete: false,
  });

  try {
    const { runSourceActionAgent } = await import("@/features/bom/agents/source-action-agent");
    const agentCode = String(input.agentCode || "").trim();
    let agentCodeRun: Record<string, unknown> | null = null;

    if (agentCode && agentConfig.toolConfig.codeExecution) {
      const { runGeminiCodeExecution } = await import("@/features/bom/services/model-runner");
      agentCodeRun = await runGeminiCodeExecution({
        code: agentCode,
        model: agentConfig.model,
        context: {
          jobId,
          supplierId,
          supplier,
          canonicalModel: String(job.model || ""),
          sourceUrl: String(input.searchUrl || input.sourceUrl || ""),
          language: String(input.agentCodeLanguage || "python"),
          agentConfig,
        },
      });
    }

    const result = await runSourceActionAgent({
      jobId,
      task,
      tierKey: String(input.tierKey || "tier0"),
      supplier,
      canonicalModel: String(job.model || ""),
      formattedModel: String(input.normalizedModel || job.model || ""),
      searchUrl: String(input.searchUrl || input.sourceUrl || ""),
      brand: job.brand,
      serial: job.serial,
      productType: job.productType,
      agentCode: String(input.agentCode || ""),
      agentCodeLanguage: String(input.agentCodeLanguage || ""),
      agentConfig,
      visualTruth: includeDiagram
        ? {
            screenshotBase64: String(
              visualTruth?.storedImageUrl ||
                (visualTruth?.base64
                  ? `data:image/png;base64,${visualTruth.base64}`
                  : visualTruth?.screenshotBase64 || ""),
            ),
            canonUrl: String(visualTruth?.canonUrl || ""),
            expectedTotal,
            assemblyNames: Array.isArray(visualTruth?.assemblyNames)
              ? visualTruth.assemblyNames
              : [],
            operatorInstructions: String(
              input.operatorInstructions ||
                visualTruth?.operatorInstructions ||
                "",
            ),
            operatorInstructionName: String(
              input.operatorInstructionName ||
                visualTruth?.operatorInstructionName ||
                "",
            ),
          }
        : null,
    });

    const completedInput = {
      ...runningInput,
      status: "complete",
      completedAt: new Date().toISOString(),
    };
    await saveBomSupplierRunInput(jobId, supplierId, completedInput);
    await saveBomSupplierRunResult(jobId, supplierId, {
      jobId,
      supplierId,
      result: agentCodeRun ? { ...result, agentCodeRun } : result,
      completedAt: new Date().toISOString(),
      status: "complete",
    });

    return NextResponse.json({
      ok: true,
      jobId,
      supplierId,
      result: agentCodeRun ? { ...result, agentCodeRun } : result,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await saveBomSupplierRunInput(jobId, supplierId, {
      ...runningInput,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: detail,
    });
    await saveBomSupplierRunResult(jobId, supplierId, {
      jobId,
      supplierId,
      status: "failed",
      error: detail,
      completedAt: new Date().toISOString(),
    });
    await failBomJob(jobId, detail);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}
