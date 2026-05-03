import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";
import { getBomJob } from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

function limitParam(req: NextRequest) {
  const parsed = Number(req.nextUrl.searchParams.get("limit") || 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, Math.round(parsed)));
}

export async function GET(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 },
    );
  }

  const rows = await db
    .select()
    .from(bomTelemetry)
    .where(eq(bomTelemetry.jobId, jobId))
    .orderBy(desc(bomTelemetry.createdAt))
    .limit(limitParam(req));

  return NextResponse.json({
    ok: true,
    telemetry: rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      event: row.event,
      status: row.status,
      model: row.model,
      brand: row.brand,
      payload: row.payload,
      createdAt: row.createdAt,
      created_at: row.createdAt,
    })),
  });
}
