import { NextRequest, NextResponse } from "next/server";
import {
  createBomJob,
  getBomJob,
  saveCompilationArtifacts,
  updateBomJobSummary,
  failBomJob,
} from "@/features/bom/services/job-store";
import type { ManualSourceActionTask } from "@/features/bom/services/source-tier-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_TASKS = new Set<ManualSourceActionTask>([
  "lock_supplier_target",
  "load_supplier_index",
  "extract_selected_assemblies",
  "price_encompass",
  "price_backup_1",
  "price_backup_2",
]);

function toTask(value: unknown): ManualSourceActionTask | null {
  const task = String(value || "") as ManualSourceActionTask;
  return ALLOWED_TASKS.has(task) ? task : null;
}

export async function POST(req: NextRequest) {
  let jobIdForFailure: string | null = null;

  try {
    const body = await req.json();
    console.log(`[SourceAction] Request:`, { task: body.task, model: body.canonicalModel, supplier: body.supplier });

    const task = toTask(body.task);
    const model = String(body.canonicalModel || body.model || "")
      .trim()
      .toUpperCase();
    const supplier = String(body.supplier || "").trim();
    const tierKey = String(body.tierKey || "").trim();

    if (!task) {
      return NextResponse.json(
        { ok: false, error: "Invalid source action task." },
        { status: 400 },
      );
    }

    if (!model) {
      return NextResponse.json(
        { ok: false, error: "Model number is required." },
        { status: 400 },
      );
    }

    if (!supplier) {
      return NextResponse.json(
        { ok: false, error: "Supplier is required." },
        { status: 400 },
      );
    }

    if (
      (task === "lock_supplier_target" || task === "load_supplier_index") &&
      supplier !== "encompass-family" &&
      !String(body.searchUrl || "").trim()
    ) {
      return NextResponse.json(
        { ok: false, error: "Supplier search URL is required." },
        { status: 400 },
      );
    }

    if (
      task === "extract_selected_assemblies" &&
      !Array.isArray(body.selectedAssemblies)
    ) {
      return NextResponse.json(
        { ok: false, error: "selectedAssemblies array is required." },
        { status: 400 },
      );
    }

    const job =
      body.jobId && typeof body.jobId === "string"
        ? await getBomJob(body.jobId)
        : await createBomJob();

    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Could not create or load BOM job." },
        { status: 500 },
      );
    }

    jobIdForFailure = job.id;

    await updateBomJobSummary(job.id, {
      jobStage: `manual_source_action_${task}`,
      brand: body.brand ?? job.brand,
      model,
      serial: body.serial ?? job.serial,
      productType: body.productType ?? job.productType,
      sourceStrategy: `manual-distributor-control:${tierKey}:${supplier}:${task}`,
      bomComplete: false,
    });

    await saveCompilationArtifacts(job.id, {
      routingPlan: {
        mode: "manual_distributor_control",
        task,
        tierKey,
        supplier,
        canonicalModel: model,
        formattedModel: body.formattedModel,
        searchUrl: body.searchUrl,
        selectedAssemblies: body.selectedAssemblies,
        pricingSource: body.pricingSource,
      },
    });

    const { runSourceActionAgent } = await import(
      "@/features/bom/agents/source-action-agent"
    );

    const result = await runSourceActionAgent({
      jobId: job.id,
      task,
      tierKey,
      supplier,
      canonicalModel: model,
      formattedModel: body.formattedModel,
      searchUrl: body.searchUrl,
      brand: body.brand ?? null,
      serial: body.serial ?? null,
      productType: body.productType ?? null,
      selectedAssemblies: Array.isArray(body.selectedAssemblies)
        ? body.selectedAssemblies
        : undefined,
      pricingSource:
        typeof body.pricingSource === "string" ? body.pricingSource : null,
      visualTruth: body.visualTruth,
    });

    return NextResponse.json(
      {
        ok: true,
        jobId: job.id,
        task,
        tierKey,
        supplier,
        status: "complete",
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[SourceAction] Failed:`, detail);

    if (jobIdForFailure) {
      await failBomJob(jobIdForFailure, detail).catch(e => console.error(`[SourceAction] Failed to record job failure:`, e));
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Source action failed.",
        detail,
      },
      { status: 500 },
    );
  }
}
