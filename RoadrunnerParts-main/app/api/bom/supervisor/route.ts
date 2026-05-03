import { NextRequest, NextResponse } from "next/server";
import { enqueueEncompassRetrievalJob } from "@/features/bom/services/retrieval-job-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { jobId, model, brand, url } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Synchronous Encompass supervisor execution is disabled. Supply jobId to queue worker retrieval.",
        },
        { status: 409 },
      );
    }

    const retrievalJob = await enqueueEncompassRetrievalJob({
      bomJobId: jobId,
      model,
      brand,
      sourceUrl: url || null,
      payload: {
        requestedBy: "bom-supervisor-compat-route",
      },
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
