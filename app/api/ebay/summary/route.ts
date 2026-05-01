import { NextRequest, NextResponse } from "next/server";
import { runStructuredJson } from "@/features/bom/services/model-runner";
import { EBAY_PROMPT_RESALE_SUMMARY } from "@/features/bom/prompts/engine";
import { ebaySummarySchema } from "@/features/ebay/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { listings } = await req.json();

    const result = await runStructuredJson<any>({
      model: "pro",
      prompt: EBAY_PROMPT_RESALE_SUMMARY,
      text: JSON.stringify(listings),
      temperature: 0,
    });

    const parsed = ebaySummarySchema.parse(result.summary || result);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[eBay Summary] Failed:", error);
    return NextResponse.json(
      { error: "Failed to summarize eBay data" },
      { status: 500 }
    );
  }
}

