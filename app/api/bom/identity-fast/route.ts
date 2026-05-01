import { NextRequest, NextResponse } from "next/server";
import { runIdentityExtractor } from "@/src/features/bom/agents/identity-extractor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userHintsStr = formData.get("userHints") as string;
    const userHints = userHintsStr ? JSON.parse(userHintsStr) : {};

    if (!file) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString("base64");

    const identity = await runIdentityExtractor({
      files: [{ mimeType: file.type, data: base64Data }],
      userHints,
    });

    return NextResponse.json({
      ok: true,
      identity,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fast extraction failed";
    return NextResponse.json({ error: message, detail: message }, { status: 500 });
  }
}
