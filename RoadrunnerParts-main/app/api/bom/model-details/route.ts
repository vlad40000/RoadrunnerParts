import { NextResponse } from "next/server";
import { db } from "@/src/server/db";
import { applianceModels } from "@/src/server/db/schema/appliance-models";
import { eq } from "drizzle-orm";
import { normalizeCanonicalModel } from "@/src/features/bom/services/source-tier-policy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");

  if (!model) {
    return NextResponse.json({ error: "Model parameter is required" }, { status: 400 });
  }

  const normalized = normalizeCanonicalModel(model);

  try {
    const [existing] = await db
      .select()
      .from(applianceModels)
      .where(eq(applianceModels.normalizedModel, normalized))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(existing);
  } catch (error) {
    console.error("[Model Details API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
