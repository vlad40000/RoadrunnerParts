import { NextRequest, NextResponse } from "next/server";
import { runAndPersistBomExtraction } from "@/features/bom/core/run-bom-extraction";
import { getBomJob, resetBomJobForRetry } from "@/features/bom/services/job-store";
import { resetBomJobGroups } from "@/features/bom/services/job-group-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const userHints = body?.userHints ?? {};

    const job = await getBomJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: "BOM job not found" },
        { status: 404 },
      );
    }

    await resetBomJobForRetry(jobId);
    await resetBomJobGroups(jobId);

    const result = await runAndPersistBomExtraction({
      jobId,
      userHints,
    });

    return NextResponse.json({
      ok: true,
      jobId,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Retry failed";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
