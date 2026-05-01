import { NextRequest, NextResponse } from "next/server";
import { runStructuredJson } from "@/features/bom/services/model-runner";
import { EBAY_PROMPT_VISIBLE_PAGE_EXTRACT } from "@/features/bom/prompts/engine";
import { ebayListingSchema } from "@/features/ebay/schemas";
import { z } from "zod";

export const runtime = "nodejs";

const responseSchema = z.object({
  listings: z.array(ebayListingSchema),
});

export async function POST(req: NextRequest) {
  try {
    const { html, text } = await req.json();

    const result = await runStructuredJson<any>({
      model: "pro",
      prompt: EBAY_PROMPT_VISIBLE_PAGE_EXTRACT,
      text: text || html || "No content provided",
      temperature: 1.0,
    });

    const parsed = responseSchema.parse(result);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[eBay Extract] Failed:", error);
    return NextResponse.json(
      { error: "Failed to extract eBay data" },
      { status: 500 }
    );
  }
}

