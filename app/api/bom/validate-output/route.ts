import { NextRequest, NextResponse } from "next/server";
import { validatePromptOutput } from "@/src/features/bom/prompt-workspace/validation";
import type { PromptScenarioType } from "@/src/features/bom/prompt-workspace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeScenarioType(value: unknown): PromptScenarioType {
  const text = String(value || "").trim();
  const allowed: PromptScenarioType[] = [
    "identity_extraction",
    "nameplate_ocr_identity_json",
    "plaintext_identity_extraction",
    "supplier_url_generation",
    "official_parts_source_search",
    "diagram_discovery",
    "technical_diagram_callouts_csv",
    "visual_qa_drift_json",
    "computer_use_navigation",
    "bom_extraction",
    "bom_row_extraction_json",
    "bom_validation",
    "pricing_reconciliation",
    "pricing_router",
    "retail_pricing_verification",
    "ebay_listing_prep",
  ];
  return allowed.includes(text as PromptScenarioType) ? (text as PromptScenarioType) : "bom_validation";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const validation = validatePromptOutput({
    scenarioType: normalizeScenarioType(body.scenarioType),
    rawOutput: body.rawOutput,
    parsedJson: body.parsedJson,
  });

  return NextResponse.json({
    ok: true,
    validation,
  });
}
