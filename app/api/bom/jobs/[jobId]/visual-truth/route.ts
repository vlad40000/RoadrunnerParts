import { NextRequest, NextResponse } from "next/server";
import {
  getBomJob,
  getBomVisualTruth,
  saveBomVisualTruth,
  updateBomJobSummary,
} from "@/features/bom/services/job-store";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  return NextResponse.json({ ok: true, visualTruth: await getBomVisualTruth(jobId) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const body = await req.json();
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  if (!String(job.model || "").trim()) {
    return NextResponse.json({ ok: false, error: "Persisted model is required before visual truth capture." }, { status: 400 });
  }
  await saveBomVisualTruth(jobId, body);
  await updateBomJobSummary(jobId, {
    jobStage: "visual_truth_captured",
    truthSource: String(body.canonUrl || body.productUrl || ""),
    expectedPartsTotal:
      typeof body.expectedTotal === "number" ? body.expectedTotal : job.expectedPartsTotal,
    expectedPartsSource:
      typeof body.expectedTotal === "number" ? "encompass_visual_truth" : job.expectedPartsSource,
  });
  return NextResponse.json({ ok: true, visualTruth: await getBomVisualTruth(jobId) });
}
