import { NextRequest, NextResponse } from "next/server";
import { runTargetedBomRecovery } from "@/features/bom/core/run-bom-recovery";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params;

    const output = await runTargetedBomRecovery({
      jobId,
      minimumUniqueParts: 40,
      minimumSections: 3,
    });

    return NextResponse.json({
      ok: true,
      jobId,
      recovered: output.recovered,
      plan: output.plan,
      result: output.result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recovery failed";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
