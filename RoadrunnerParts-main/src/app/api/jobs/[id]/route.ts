import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { retrievalJobs } from "@/server/db/schema/retrieval-system";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const [job] = await db.select().from(retrievalJobs).where(eq(retrievalJobs.id, id));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(job);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
