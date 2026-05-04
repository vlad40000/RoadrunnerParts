import { NextResponse } from "next/server";
import { db } from "@/src/server/db";
import { applianceModels } from "@/src/server/db/schema/appliance-models";
import { providerPartSeedRows } from "@/src/server/db/schema/provider-seeds";
import { eq, sql } from "drizzle-orm";
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
      const seedRows = await db
        .select()
        .from(providerPartSeedRows)
        .where(sql`upper(regexp_replace(${providerPartSeedRows.model}, '[^A-Z0-9]', '', 'g')) = ${normalized}`)
        .limit(500);

      if (!seedRows.length) {
        return NextResponse.json({ error: "Model not found" }, { status: 404 });
      }

      const first = seedRows[0];
      return NextResponse.json({
        normalizedModel: normalized,
        model: first.model,
        brand: first.brand,
        applianceType: first.applianceType,
        fuelType: first.fuelType,
        source: "provider_part_seed_rows",
        sourceStatus: first.sourceStatus,
        sourceFile: first.sourceFile,
        provider: first.provider,
        providerModelUrl: first.providerModelUrl,
        trustedTotalPartCount: null,
        actualCanonicalPartCount: seedRows.length,
        partsComplete: false,
        retrievalState: "parts_seeded_pricing_needed",
      });
    }

    return NextResponse.json(existing);
  } catch (error) {
    console.error("[Model Details API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
