import { NextRequest, NextResponse } from "next/server";
import { runStructuredJson } from "@/src/features/bom/services/model-runner";
import { EBAY_PROMPT_LISTING_DRAFT } from "@/src/features/bom/prompts/engine";
import { ebayDraftSchema } from "@/src/features/ebay/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { partDetails, marketSummary } = await req.json();

    const result = await runStructuredJson<any>({
      model: "pro",
      prompt: EBAY_PROMPT_LISTING_DRAFT,
      text: JSON.stringify({ partDetails, marketSummary }),
      temperature: 0,
    });

    const parsed = ebayDraftSchema.parse(result.draft || result);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[eBay Draft] Failed:", error);
    return NextResponse.json(
      { error: "Failed to generate eBay draft" },
      { status: 500 }
    );
  }
}
