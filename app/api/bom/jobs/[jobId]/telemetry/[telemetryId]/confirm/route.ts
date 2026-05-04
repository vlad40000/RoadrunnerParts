import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";
import { getBomJob } from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ jobId: string; telemetryId: string }>;
};

/**
 * POST /api/bom/jobs/[jobId]/telemetry/[telemetryId]/confirm
 *
 * Operator HITL approval / rejection for a pending telemetry event.
 * Writes the decision back as the `status` of the row so the agent
 * polling the feed can unblock.
 *
 * Body: { confirmed: boolean }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { jobId, telemetryId } = await params;

  const job = await getBomJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "BOM job not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const confirmed: boolean = body.confirmed === true;

  const nextStatus = confirmed ? "approved" : "rejected";

  await db
    .update(bomTelemetry)
    .set({ status: nextStatus })
    .where(eq(bomTelemetry.id, telemetryId));

  // Also insert a new event row so the feed history is auditable.
  await db.insert(bomTelemetry).values({
    jobId,
    event: "operator_decision",
    status: nextStatus,
    model: job.model ?? undefined,
    brand: job.brand ?? undefined,
    payload: {
      targetTelemetryId: telemetryId,
      confirmed,
      decidedAt: new Date().toISOString(),
      decidedBy: "operator_dashboard",
    },
  });

  return NextResponse.json({ ok: true, status: nextStatus, telemetryId });
}
