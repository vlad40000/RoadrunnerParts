import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const jobId = String(body?.jobId || "").trim();
    const model = String(body?.model || "").trim();
    const brand = String(body?.brand || "").trim() || null;
    const serial = String(body?.serial || "").trim() || null;
    const productType = String(body?.productType || "").trim() || null;


    if (!model) {
      return NextResponse.json({ error: "Missing model" }, { status: 400 });
    }

    const { resolveExactModelUrl } = await import(
      "@/src/features/bom/services/search/exact-model-url-resolver"
    );

    const resolution = await resolveExactModelUrl({
      model,
      domain: "searspartsdirect.com",
      preferredQueries: [
        `site:searspartsdirect.com "${model}" "By Schematic"`,
        `site:searspartsdirect.com "${model}" "SELECT DIAGRAM"`,
        `site:searspartsdirect.com "${model}" "All Model Parts"`,
        `site:searspartsdirect.com "${model}" "${brand ?? ""}"`,
        `site:searspartsdirect.com "${model}" "${productType ?? ""}" parts`,
      ],
    });

    const expectedPartsTotal = Number(resolution?.expectedPartsTotal || 0);
    const expectedPartsSource = resolution?.expectedPartsSource || "sears_exact_match_result";

    if (jobId) {
      const { updateBomJobSummary } = await import(
        "@/src/features/bom/services/job-store"
      );

      await updateBomJobSummary(jobId, {
        brand,
        model,
        serial,
        productType,
        expectedPartsTotal: expectedPartsTotal || null,
        expectedPartsSource: expectedPartsTotal ? expectedPartsSource : null,
      });
    }

    return NextResponse.json({
      ok: true,
      jobId,
      model,
      expectedPartsTotal,
      expectedPartsSource: expectedPartsTotal ? expectedPartsSource : null,
      modelUrl: resolution?.url || null,
      found: expectedPartsTotal > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expected count lookup failed";
    return NextResponse.json(
      { error: message, detail: message },
      { status: 500 },
    );
  }
}
