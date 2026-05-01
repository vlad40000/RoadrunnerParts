import { NextRequest, NextResponse } from "next/server";
import { getBomJob } from "@/features/bom/services/job-store";
import { listBomJobGroups } from "@/features/bom/services/job-group-store";
import { discoverDiagramGroupsForJob } from "@/features/bom/core/grouped-bom";

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
    return NextResponse.json({ error: "BOM job not found" }, { status: 404 });
  }

  const groups = await listBomJobGroups(jobId);

  return NextResponse.json({ ok: true, job, groups });
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;
    const body = await req.json().catch(() => ({}));
    const identity = body?.identity ?? {};

    const output = await discoverDiagramGroupsForJob({
      jobId,
      identity: {
        brand: identity.brand,
        resolvedBrand: identity.resolvedBrand,
        model: identity.model,
        serial: identity.serial,
        productType: identity.productType,
        confidence: identity.confidence,
        searchConfidence: identity.searchConfidence,
        familyKey: identity.familyKey,
      },
    });

    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagram discovery failed";
    return NextResponse.json({ error: message, detail: message }, { status: 500 });
  }
}
