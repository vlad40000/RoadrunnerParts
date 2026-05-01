import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;

    after(async () => {
      console.log(`[CompileApi] Background supervisor started for ${jobId}`);
      try {
        const { getBomJob, failBomJob, completeBomJob } = await import("@/features/bom/services/job-store");
        const job = await getBomJob(jobId);
        
        if (!job) {
          console.error(`[CompileApi] Job not found: ${jobId}`);
          return;
        }

        const { buildBomJob } = await import("@/features/bom/core/bom-orchestrator");
        const compiled = await buildBomJob({
          jobId,
          identityFiles: [],
          userHints: {
            brand: job.brand || undefined,
            model: job.model || undefined,
            serial: job.serial || undefined,
            productType: job.productType || undefined,
          },
          mode: "full",
        });

        // buildBomJob already calls completeBomJob or saveBomArtifacts internally if provided
        // but the orchestrator I saw doesn't take onComplete. It returns the result.
        // Wait, buildBomJob in core/bom-orchestrator.ts returns BuildBomJobOutput.
      } catch (err) {
        console.error(`[Background Supervisor Error]`, err);
        const message = err instanceof Error ? err.message : String(err);
        const { failBomJob } = await import("@/features/bom/services/job-store");
        await failBomJob(jobId, message);
      }
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: "started",
    }, { status: 202 });
  } catch (error) {
    console.error(`[CompileApi] Execution failed:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Compilation failed",
      },
      { status: 500 },
    );
  }
}
