import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { partPricing } from "@/server/db/schema/retrieval-system";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { modelId: string } }) {
  try {
    const { modelId } = params;
    const pricing = await db.select().from(partPricing).where(eq(partPricing.modelId, modelId));
    return NextResponse.json({ pricing });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
