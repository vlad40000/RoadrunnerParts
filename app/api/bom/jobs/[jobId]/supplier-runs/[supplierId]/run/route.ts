import { NextRequest, NextResponse } from "next/server";
import { getBomJob, saveBomSupplierRunResult } from "@/features/bom/services/job-store";

type Params = { params: Promise<{ jobId: string; supplierId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId, supplierId } = await params;
  const body = await req.json();
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  await saveBomSupplierRunResult(jobId, supplierId, body);
  return NextResponse.json({ ok: true, jobId, supplierId, result: body });
}
