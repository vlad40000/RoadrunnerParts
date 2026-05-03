import { NextRequest, NextResponse } from "next/server";
import { runIdentityExtractor } from "@/src/features/bom/agents/identity-extractor";
import { prepareManualIdentityContextFromBuffer } from "@/src/features/bom/services/manual/manual-ingest";

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

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    let evidenceText: string | undefined;
    const files = [{ mimeType: file.type, data: base64Data }];

    if (isPdf) {
      try {
        const manualContext = await prepareManualIdentityContextFromBuffer({
          buffer: Buffer.from(buffer),
          fileName: file.name,
        });
        evidenceText = manualContext.markdown;
        files.length = 0;
      } catch (error) {
        evidenceText = `PDF_TEXT_EXTRACTION_FAILED: ${
          error instanceof Error ? error.message : "unknown error"
        }`;
      }
    }

    const identity = await runIdentityExtractor({
      files,
      userHints,
      evidenceText,
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
