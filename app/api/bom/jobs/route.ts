import { NextRequest, NextResponse } from "next/server";
import { createOrReuseBomJob, getBomJob } from "@/features/bom/services/job-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const job = await createOrReuseBomJob({
      model: body.model,
      brand: body.brand,
      serial: body.serial,
      productType: body.productType,
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Job creation failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
  }
  const job = await getBomJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}
