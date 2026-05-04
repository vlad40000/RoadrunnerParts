import { NextRequest, NextResponse } from "next/server";
import type { PromptScenario } from "@/src/features/bom/prompt-workspace/types";
import {
  listPromptScenarios,
  upsertPromptScenario,
} from "@/src/features/bom/prompt-workspace/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function scenarioFromBody(body: Record<string, unknown>): PromptScenario {
  const id = String(body.id || crypto.randomUUID()).trim();
  const name = String(body.name || "Untitled Scenario").trim();
  const type = String(body.type || "identity_extraction") as PromptScenario["type"];

  return {
    id,
    name,
    type,
    description: String(body.description || "").trim(),
    systemPrompt: String(body.systemPrompt || "").trim(),
    userPromptTemplate: String(body.userPromptTemplate || "").trim(),
    requiredInputs: Array.isArray(body.requiredInputs)
      ? body.requiredInputs.map((item) => String(item))
      : [],
    expectedJsonShape: body.expectedJsonShape,
    enabled: body.enabled !== false,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    scenarios: listPromptScenarios(),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const scenario = upsertPromptScenario(scenarioFromBody(body));

  return NextResponse.json({
    ok: true,
    scenario,
  });
}
