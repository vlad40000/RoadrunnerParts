import { NextResponse } from "next/server";
import { enqueueEncompassRetrievalJob } from "@/features/bom/services/retrieval-job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deprecated compatibility route.
 *
 * Browser capture now belongs to the Docker worker. This route only queues
 * Encompass work when a BOM job id is supplied; it never launches Playwright.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      jobId?: string;
      model?: string;
      brand?: string;
      canonUrl?: string;
      sourceUrl?: string;
    };

    if (!body.jobId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Synchronous Encompass browser capture is disabled. Queue an Encompass retrieval job from a persisted BOM job.",
        },
        { status: 409 },
      );
    }

    const retrievalJob = await enqueueEncompassRetrievalJob({
      bomJobId: body.jobId,
      model: body.model,
      brand: body.brand,
      sourceUrl: body.sourceUrl || body.canonUrl || null,
      payload: {
        requestedBy: "deprecated-assembly-overview-capture-route",
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
      error instanceof Error ? error.message : "Failed to queue Encompass work";
    return NextResponse.json(
      { ok: false, error: message, detail: message },
      { status: 500 },
    );
  }
}
