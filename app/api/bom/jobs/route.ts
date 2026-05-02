import { NextRequest, NextResponse } from "next/server";
import { createBomJob } from "@/features/bom/services/job-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const job = await createBomJob();
    return NextResponse.json({
      ok: true,
      jobId: job?.id,
    });
  } catch (error) {
    console.error(`[JobsApi] Failed to create job:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Job creation failed",
      },
      { status: 500 },
    );
  }
}
