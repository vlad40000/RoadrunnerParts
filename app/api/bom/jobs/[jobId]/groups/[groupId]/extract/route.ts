import { NextRequest, NextResponse } from "next/server";
import { extractDiagramGroupForJob } from "@/features/bom/core/grouped-bom";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    jobId: string;
    groupId: string;
  }>;
};

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { jobId, groupId } = await params;
    const output = await extractDiagramGroupForJob({ jobId, groupId });
    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Diagram group extraction failed";
    return NextResponse.json({ error: message, detail: message }, { status: 500 });
  }
}
