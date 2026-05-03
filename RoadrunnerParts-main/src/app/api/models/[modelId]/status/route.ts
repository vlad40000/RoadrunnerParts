import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { modelRetrievalSummary } from "@/server/db/schema/retrieval-system";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { modelId: string } }) {
  try {
    const { modelId } = params;
    const [summary] = await db.select().from(modelRetrievalSummary).where(eq(modelRetrievalSummary.modelId, modelId));
    if (!summary) return NextResponse.json({ status: "not_started" });
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
