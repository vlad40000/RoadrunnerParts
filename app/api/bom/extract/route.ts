import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const jobId = String(body.jobId || "");
    const stage = body.stage === "identity" ? "identity" : "bom";
    const userHints = body.userHints ?? {};

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId" },
        { status: 400 },
      );
    }

    const { runAndPersistBomExtraction } = await import(
      "@/src/features/bom/core/run-bom-extraction"
    );

    // Fire and forget: Do not await the extraction.
    // The frontend is already polling and will pick up the updates in the DB.
    runAndPersistBomExtraction({
      jobId,
      mode: stage === "identity" ? "identity" : "full",
      userHints,
    }).catch((err) => {
      console.error(`[ExtractRoute] Background extraction failed for ${jobId}:`, err);
    });

    return NextResponse.json({
      ok: true,
      jobId,
      stage,
      status: "queued"
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Extraction failed";

    return NextResponse.json(
      { error: message, detail: message },
      { status: 500 },
    );
  }
}
