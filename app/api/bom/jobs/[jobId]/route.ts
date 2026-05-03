import { NextRequest, NextResponse } from "next/server";
import {
  getBomJob,
  getBomVisualTruth,
  saveBomVisualTruth,
  updateBomJobSummary,
} from "@/src/features/bom/services/job-store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: "BOM job not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    job,
  });
}

function nonEmptyString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : undefined;
}

function positiveInteger(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
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
  const expectedPartsTotal = positiveInteger(body.expectedPartsTotal);
  const summaryPatch: Parameters<typeof updateBomJobSummary>[1] = {};

  const brand = nonEmptyString(body.brand);
  const serial = nonEmptyString(body.serial);
  const productType = nonEmptyString(body.productType);
  const truthSource = nonEmptyString(body.truthSource);
  const expectedPartsSource = nonEmptyString(body.expectedPartsSource);

  if (brand) summaryPatch.brand = brand;
  if (serial) summaryPatch.serial = serial;
  if (productType) summaryPatch.productType = productType;
  if (truthSource) summaryPatch.truthSource = truthSource;
  if (expectedPartsTotal) {
    summaryPatch.expectedPartsTotal = expectedPartsTotal;
    summaryPatch.expectedPartCount = expectedPartsTotal;
    summaryPatch.expectedPartsSource = expectedPartsSource || "operator_override";
    summaryPatch.trustedTotalPartCount = expectedPartsTotal;
    summaryPatch.trustedTotalCountSource = expectedPartsSource || "operator_override";
    if (truthSource) summaryPatch.trustedTotalCountSourceUrl = truthSource;
    summaryPatch.trustedTotalCountCheckedAt = new Date();
  }

  if (Object.keys(summaryPatch).length > 0) {
    await updateBomJobSummary(jobId, summaryPatch);
  }

  if (body.visualTruth && typeof body.visualTruth === "object") {
    const existing = (await getBomVisualTruth(jobId)) || {};
    const visualTruthPatch = body.visualTruth as Record<string, unknown>;
    const visualExpectedTotal = positiveInteger(visualTruthPatch.expectedTotal);

    await saveBomVisualTruth(jobId, {
      ...existing,
      ...visualTruthPatch,
      ...(visualExpectedTotal ? { expectedTotal: visualExpectedTotal } : {}),
      updatedBy: "operator_dashboard",
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    job: await getBomJob(jobId),
    visualTruth: await getBomVisualTruth(jobId),
  });
}
