import { NextRequest, NextResponse } from "next/server";
import { normalizeModelNumber } from "@/features/bom/utils/normalization";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { model } = await req.json();
    if (!model) return NextResponse.json({ error: "Missing model" }, { status: 400 });
    const normalized = normalizeModelNumber(model);
    return NextResponse.json({ normalized });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
