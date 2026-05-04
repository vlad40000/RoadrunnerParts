import { NextRequest, NextResponse } from "next/server";
import type { PromptScenario } from "@/src/features/bom/prompt-workspace/types";
import {
  getPromptScenario,
  upsertPromptScenario,
} from "@/src/features/bom/prompt-workspace/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const scenario = getPromptScenario(id);

  if (!scenario) {
    return NextResponse.json({ ok: false, error: "Scenario not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, scenario });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = getPromptScenario(id);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Scenario not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<PromptScenario>;
  const scenario: PromptScenario = {
    ...existing,
    ...body,
    id: existing.id,
    requiredInputs: Array.isArray(body.requiredInputs)
      ? body.requiredInputs.map((item) => String(item))
      : existing.requiredInputs,
    enabled: body.enabled ?? existing.enabled,
  };

  upsertPromptScenario(scenario);

  return NextResponse.json({ ok: true, scenario });
}
