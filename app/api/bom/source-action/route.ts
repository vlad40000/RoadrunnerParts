import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  createBomJob,
  getBomJob,
  saveCompilationArtifacts,
  setBomJobStage,
  updateBomJobSummary,
  failBomJob,
} from "@/features/bom/services/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_TASKS = new Set(["parts_diagrams", "parts_bom", "pricing"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const task = String(body.task || "");
    const model = String(body.canonicalModel || body.model || "").trim().toUpperCase();
    const supplier = String(body.supplier || "");
    const tierKey = String(body.tierKey || "");

    if (!ALLOWED_TASKS.has(task)) {
      return NextResponse.json({ ok: false, error: "Invalid source action task." }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ ok: false, error: "Model number is required." }, { status: 400 });
    }

    if (!supplier) {
      return NextResponse.json({ ok: false, error: "Supplier is required." }, { status: 400 });
    }

    const job =
      body.jobId && typeof body.jobId === "string"
        ? await getBomJob(body.jobId)
        : await createBomJob();

    if (!job) {
      return NextResponse.json({ ok: false, error: "Could not create or load BOM job." }, { status: 500 });
    }

    await updateBomJobSummary(job.id, {
      jobStage: `source_action_${task}`,
      brand: body.brand ?? job.brand,
      model,
      serial: body.serial ?? job.serial,
      productType: body.productType ?? job.productType,
      sourceStrategy: `manual-distributor-control:${tierKey}:${supplier}:${task}`,
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
        assemblyTitle: body.assemblyTitle,
        expectedGroupPartCount: body.expectedGroupPartCount,
        pricingOrder: body.pricingOrder,
      },
    });

    after(async () => {
      try {
        await setBomJobStage(job.id, `source_action_running_${task}`);

        const { runSourceActionAgent } = await import(
          "@/features/bom/agents/source-action-agent"
        );

        await runSourceActionAgent({
          jobId: job.id,
          task: task as any,
          tierKey,
          supplier,
          canonicalModel: model,
          formattedModel: body.formattedModel,
          searchUrl: body.searchUrl,
          brand: body.brand ?? null,
          serial: body.serial ?? null,
          productType: body.productType ?? null,
          assemblyTitle: body.assemblyTitle ?? null,
          expectedGroupPartCount:
            typeof body.expectedGroupPartCount === "number"
              ? body.expectedGroupPartCount
              : null,
          pricingOrder: Array.isArray(body.pricingOrder)
            ? body.pricingOrder
            : ["encompass-family", supplier, "partsdr"],
        });
      } catch (error) {
        await failBomJob(job.id, error instanceof Error ? error.message : String(error));
      }
    });

    return NextResponse.json(
      {
        ok: true,
        jobId: job.id,
        task,
        tierKey,
        supplier,
        status: "started",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Source action failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
