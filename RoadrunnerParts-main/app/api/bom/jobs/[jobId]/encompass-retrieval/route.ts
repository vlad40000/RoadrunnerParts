import { NextRequest, NextResponse } from "next/server";
import {
  createEncompassModelPageJob,
  enqueueEncompassRetrievalJob,
  listRetrievalJobsForBomJob,
} from "@/features/bom/services/retrieval-job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));

    const payload = {
      requestedBy: "api",
      sourcePolicy: "db_first_worker",
      ...(body.payload && typeof body.payload === "object" ? body.payload : {}),
    };

    const retrievalJob = body.sourceUrl
      ? await enqueueEncompassRetrievalJob({
          bomJobId: jobId,
          model: body.model,
          brand: body.brand,
          sourceUrl: body.sourceUrl,
          priority: body.priority,
          payload,
        })
      : await createEncompassModelPageJob({
          bomJobId: jobId,
          model: body.model,
          brand: body.brand,
          priority: body.priority,
          payload,
        });

    return NextResponse.json(
      {
        ok: true,
        status: "queued",
        retrievalJob,
      },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to queue Encompass retrieval";
    return NextResponse.json(
      { ok: false, error: message, detail: message },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const retrievalJobs = await listRetrievalJobsForBomJob(jobId);
    return NextResponse.json({ ok: true, retrievalJobs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load retrieval jobs";
    return NextResponse.json(
      { ok: false, error: message, detail: message },
      { status: 500 },
    );
  }
}
