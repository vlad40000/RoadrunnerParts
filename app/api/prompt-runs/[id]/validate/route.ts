import { NextRequest, NextResponse } from "next/server";
import { getPromptRun } from "@/src/features/bom/prompt-workspace/server-store";
import { validatePromptOutput } from "@/src/features/bom/prompt-workspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const run = getPromptRun(id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (!run && !body.scenarioType) {
    return NextResponse.json({ ok: false, error: "Prompt run not found" }, { status: 404 });
  }

  const scenarioType = (body.scenarioType || run?.scenarioType) as Parameters<typeof validatePromptOutput>[0]["scenarioType"];
  const rawOutput = body.rawOutput ?? run?.outputs?.[0]?.rawOutput ?? "";
  const parsedJson = body.parsedJson ?? run?.outputs?.[0]?.parsedJson;
  const validation = validatePromptOutput({
    scenarioType,
    rawOutput,
    parsedJson,
  });

  return NextResponse.json({
    ok: true,
    validation,
  });
}
