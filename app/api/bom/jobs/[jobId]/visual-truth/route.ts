import { NextRequest, NextResponse } from "next/server";
import { getBomJob, saveBomVisualTruth } from "@/features/bom/services/job-store";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  return NextResponse.json({ ok: true, visualTruth: (job.diagramParse as any)?.visualTruth ?? null });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const body = await req.json();
  await saveBomVisualTruth(jobId, body);
  const job = await getBomJob(jobId);
  return NextResponse.json({ ok: true, visualTruth: (job?.diagramParse as any)?.visualTruth ?? null });
}
