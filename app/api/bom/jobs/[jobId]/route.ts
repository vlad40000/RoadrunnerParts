import { NextRequest, NextResponse } from "next/server";
import { getBomJob } from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "BOM job not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    job,
  });
}
