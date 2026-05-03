import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { bomParts } from "@/server/db/schema/retrieval-system";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { modelId: string } }) {
  try {
    const { modelId } = params;
    const parts = await db.select().from(bomParts).where(eq(bomParts.modelId, modelId));
    return NextResponse.json({ parts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
