import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bomJobs } from "@/server/db/schema/bom-jobs";
import { getBomJob } from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    instructions: job.systemInstructions || "",
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { instruction, append } = body;

  if (typeof instruction !== "string") {
    return NextResponse.json(
      { ok: false, error: "Instruction must be a string." },
      { status: 400 },
    );
  }

  let finalInstructions = instruction;
  if (append && job.systemInstructions) {
    finalInstructions = `${job.systemInstructions}\n\n${instruction}`;
  }

  await db
    .update(bomJobs)
    .set({
      systemInstructions: finalInstructions,
      updatedAt: new Date(),
    })
    .where(eq(bomJobs.id, jobId));

  return NextResponse.json({
    ok: true,
    instructions: finalInstructions,
  });
}
