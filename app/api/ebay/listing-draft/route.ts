import { NextRequest, NextResponse } from "next/server";
import { runStructuredJson } from "@/features/bom/services/model-runner";
import { EBAY_LISTING_DRAFT_PROMPT } from "@/features/bom/prompts/engine";
import { ebayDraftSchema } from "@/features/ebay/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { partDetails, marketSummary } = await req.json();

    const result = await runStructuredJson<any>({
      model: "fast",
      prompt: EBAY_LISTING_DRAFT_PROMPT,
      text: JSON.stringify({ partDetails, marketSummary }),
      temperature: 1.0,
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

