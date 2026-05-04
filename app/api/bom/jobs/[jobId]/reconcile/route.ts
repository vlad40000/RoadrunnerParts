import { NextRequest, NextResponse } from "next/server";
import { getBomJob, saveBomArtifacts, updateBomJobSummary } from "@/src/features/bom/services/job-store";
import { ReconciliationService } from "@/src/features/bom/services/reconciliation-service";
import { RetrievedSource } from "@/src/features/bom/services/providers/types";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 }
    );
  }

  const sources = (job.retrievedSources || []) as unknown as RetrievedSource[];
  if (sources.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No retrieved sources available for reconciliation",
    });
  }

  try {
    const report = ReconciliationService.reconcile(job.model || "UNKNOWN", sources);
    
    // Persist the report into diagramParse for the UI to consume
    const existingDiagramParse = (job.diagramParse || {}) as Record<string, any>;
    await updateBomJobSummary(jobId, {
      diagramParse: {
        ...existingDiagramParse,
        reconciliationReport: report,
        reconciledAt: new Date().toISOString(),
      },
      actualUniqueParts: report.totalUniqueParts,
      actualCanonicalPartCount: report.totalUniqueParts,
      coveragePct: report.totalUniqueParts > 0 
        ? Math.round((report.overlapCount / report.totalUniqueParts) * 100) 
        : 0,
    });

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (err) {
    console.error("Reconciliation failed:", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Reconciliation failed",
    }, { status: 500 });
  }
}
