import { NextRequest, NextResponse } from "next/server";
import { getPromptRun } from "@/src/features/bom/prompt-workspace/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const run = getPromptRun(id);

  if (!run) {
    return NextResponse.json({ ok: false, error: "Prompt run not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, run });
}
