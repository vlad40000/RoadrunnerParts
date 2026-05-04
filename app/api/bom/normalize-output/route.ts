import { NextRequest, NextResponse } from "next/server";
import { normalizeModelOutput } from "@/src/features/bom/prompt-workspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeModelOutput(body.rawOutput ?? body.output ?? "");

  return NextResponse.json({
    ok: true,
    normalized,
  });
}
