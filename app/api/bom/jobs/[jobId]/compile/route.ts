import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runBomSupervisor } from "@/features/bom/core/agents/supervisor";

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

        const compiled = await runBomSupervisor({
          jobId,
          brand: job.brand || "",
          model: job.model || "",
          initialRows: (job.finalRows as any[]) || [],
        });

        await completeBomJob(jobId, {
          brand: job.brand || null,
          model: job.model || null,
          serial: job.serial || null,
          productType: job.productType || null,
          rawRowCount: compiled.rows.length,
          uniqueRowCount: compiled.rows.length,
          coverageScore: compiled.coveragePct ?? 0,
          resultStatus: compiled.rows.length > 0 ? "bom_complete" : "zero_rows",
          issues: [],
          unmatchedCallouts: [],
          finalRows: compiled.rows as any,
        });
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
