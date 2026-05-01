import { NextRequest, NextResponse } from "next/server";
import { PRICE_PROMPT_RETAIL_ENRICHMENT } from "@/features/bom/prompts/engine";
import { runStructuredJson } from "@/features/bom/services/model-runner";
import { z } from "zod";

export const runtime = "nodejs";

const enrichmentSchema = z.object({
  enrichments: z.array(z.object({
    partNumber: z.string(),
    price: z.number().nullable(),
    priceSource: z.string().nullable(),
    availability: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  })),
});

export async function POST(req: NextRequest) {
  try {
    const { partNumbers, model } = await req.json();

    if (!partNumbers || !Array.isArray(partNumbers)) {
      return NextResponse.json({ error: "Invalid partNumbers" }, { status: 400 });
    }

    const result = await runStructuredJson<any>({
      model: "pro",
      prompt: PRICE_PROMPT_RETAIL_ENRICHMENT,
      text: JSON.stringify({ partNumbers, model }),
      temperature: 0,
    });

    const parsed = enrichmentSchema.parse(result);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[Price Enrichment] Failed:", error);
    return NextResponse.json(
      { error: "Price enrichment failed" },
      { status: 500 }
    );
  }
}

