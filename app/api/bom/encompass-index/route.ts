import { NextRequest, NextResponse } from "next/server";
import { resolveEncompassExplodedViewUrl } from "@/features/bom/services/encompass-model-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get("model");
  const brand = searchParams.get("brand");

  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  try {
    const result = await resolveEncompassExplodedViewUrl({
      model,
      routeHint: null, // Let the index find it based on normalized model first
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to resolve Encompass URL", detail: String(error) },
      { status: 500 },
    );
  }
}
