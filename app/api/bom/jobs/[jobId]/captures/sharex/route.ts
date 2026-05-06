import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";
import { getBomJob } from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("image") as File;
  const slotId = formData.get("slotId") as string || "slot_a";

  if (!file) {
    return NextResponse.json(
      { ok: false, error: "No image file provided." },
      { status: 400 },
    );
  }

  // Convert to base64 for direct telemetry embedding
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64Image = buffer.toString("base64");
  const dataUri = `data:${file.type};base64,${base64Image}`;

  const [row] = await db
    .insert(bomTelemetry)
    .values({
      jobId,
      slotId,
      event: "manual_vision_capture",
      status: "complete",
      model: job.model,
      brand: job.brand,
      payload: {
        source: "ShareX",
        fileName: file.name,
        mimeType: file.type,
        image: dataUri,
        timestamp: new Date().toISOString(),
      },
    })
    .returning();

  return NextResponse.json({
    ok: true,
    telemetryId: row.id,
    message: "Manual vision capture stored successfully.",
  });
}
