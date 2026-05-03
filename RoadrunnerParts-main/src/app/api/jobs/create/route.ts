import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { retrievalJobs, applianceModels } from "@/server/db/schema/retrieval-system";
import { normalizeModelNumber } from "@/features/bom/utils/normalization";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { modelNumber, brand, jobType = "full_bom_retrieval" } = await req.json();
    if (!modelNumber) return NextResponse.json({ error: "Missing modelNumber" }, { status: 400 });
    
    const normalized = normalizeModelNumber(modelNumber);
    let [model] = await db.select().from(applianceModels).where(eq(applianceModels.normalizedModel, normalized));
    if (!model) {
      [model] = await db.insert(applianceModels).values({ normalizedModel: normalized, rawModel: modelNumber, brand }).returning();
    }
    
    const [job] = await db.insert(retrievalJobs).values({
      modelId: model.id,
      modelNumber: normalized,
      brand,
      jobType,
      status: "queued"
    }).returning();
    
    return NextResponse.json({ jobId: job.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
