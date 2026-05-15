import { NextRequest, NextResponse } from "next/server";
import { runBomPartWorkflow } from "@/features/bom/services/bom-part-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const modelNumber = String(body.modelNumber || body.model || "").trim().toUpperCase();

    if (!modelNumber) {
      return NextResponse.json(
        { ok: false, error: "Model number is required." },
        { status: 400 },
      );
    }

    const result = await runBomPartWorkflow({
      jobId: typeof body.jobId === "string" ? body.jobId : null,
      modelNumber,
      brand: typeof body.brand === "string" ? body.brand : null,
      serial: typeof body.serial === "string" ? body.serial : null,
      productType: typeof body.productType === "string" ? body.productType : null,
      maxPricingLookups:
        typeof body.maxPricingLookups === "number" ? body.maxPricingLookups : null,
      modelTimeoutMs:
        typeof body.modelTimeoutMs === "number" ? body.modelTimeoutMs : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: "BOM part workflow failed.", detail },
      { status: 500 },
    );
  }
}
