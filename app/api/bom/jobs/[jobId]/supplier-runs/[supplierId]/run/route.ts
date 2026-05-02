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

type Params = { params: Promise<{ jobId: string; supplierId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { jobId, supplierId } = await params;
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (!String(job.model || "").trim()) {
    return NextResponse.json({ ok: false, error: "Persisted model is required before supplier runs." }, { status: 400 });
  }

  const supplierRun = await getBomSupplierRun(jobId, supplierId);
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

  const runningInput = {
    ...input,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await saveBomSupplierRunInput(jobId, supplierId, runningInput);
  await updateBomJobSummary(jobId, {
    jobStage: `supplier_run_${supplierId}_running`,
    sourceStrategy: `manual-distributor-control:${String(input.tierKey || "tier0")}:${String(input.supplier || supplierId)}:${String(input.task || "load_supplier_index")}`,
    bomComplete: false,
  });

  try {
    const { runSourceActionAgent } = await import("@/features/bom/agents/source-action-agent");

    const result = await runSourceActionAgent({
      jobId,
      task: String(input.task || "load_supplier_index") as any,
      tierKey: String(input.tierKey || "tier0"),
      supplier: String(input.supplier || supplierId),
      canonicalModel: String(job.model || ""),
      formattedModel: String(input.normalizedModel || job.model || ""),
      searchUrl: String(input.searchUrl || input.sourceUrl || ""),
      brand: job.brand,
      serial: job.serial,
      productType: job.productType,
      visualTruth: includeDiagram
        ? {
            screenshotBase64: String(
              visualTruth?.storedImageUrl ||
                (visualTruth?.base64
                  ? `data:image/png;base64,${visualTruth.base64}`
                  : visualTruth?.screenshotBase64 || ""),
            ),
            canonUrl: String(visualTruth?.canonUrl || ""),
            expectedTotal:
              input.includeExpectedCount !== false &&
              typeof visualTruth?.expectedTotal === "number"
                ? visualTruth.expectedTotal
                : null,
            assemblyNames: Array.isArray(visualTruth?.assemblyNames)
              ? visualTruth.assemblyNames
              : [],
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
      result,
      completedAt: new Date().toISOString(),
      status: "complete",
    });

    return NextResponse.json({ ok: true, jobId, supplierId, result });
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
