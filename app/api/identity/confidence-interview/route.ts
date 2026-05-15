import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { scheduleGeminiCall } from "../../../../src/lib/gemini-call-scheduler";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const IDENTITY_MODEL = process.env.IDENTITY_LITE_MODEL || process.env.GEMINI_LITE_MODEL || "gemini-3.1-flash-lite-preview";

// ── Types ────────────────────────────────────────────────────────────────────

interface QAPair {
  question: string;
  answer: string;
}

interface InterviewRequest {
  /** base64-encoded nameplate image (optional) */
  nameplateBase64?: string;
  nameplateType?: string;
  /** base64-encoded product/listing image (optional) */
  productBase64?: string;
  productType?: string;
  /** Structured OCR result from extract-model endpoint */
  ocrResult?: Record<string, unknown>;
  /** Boolean feature cue flags from extract-feature-cues endpoint */
  featureCues?: Record<string, boolean>;
  /** Prior Q&A exchange in this interview */
  history?: QAPair[];
  /** The operator's answer to the last question (appended to history by client) */
  partNumber?: string; // hint from the listing context
}

interface InterviewResponse {
  /** 0.0 – 1.0 */
  confidence: number;
  /** "machine" | "part" | "unknown" */
  entityType: "machine" | "part" | "unknown";
  /** Extracted fields so far */
  fields: {
    // machine fields
    make?: string;
    model?: string;
    serialNumber?: string;
    manufactureYear?: string;
    ageRange?: string;
    // part fields
    partNumber?: string;
    partTitle?: string;
    brands?: string[];
  };
  /** null when resolved or AI has no more questions */
  nextQuestion: string | null;
  /** true when confidence >= 0.92 */
  resolved: boolean;
  /** Human-readable summary of what the AI knows */
  summary: string;
}

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    confidence: { type: SchemaType.NUMBER },
    entityType: { type: SchemaType.STRING },
    fields: {
      type: SchemaType.OBJECT,
      properties: {
        make:          { type: SchemaType.STRING },
        model:         { type: SchemaType.STRING },
        serialNumber:  { type: SchemaType.STRING },
        manufactureYear: { type: SchemaType.STRING },
        ageRange:      { type: SchemaType.STRING },
        partNumber:    { type: SchemaType.STRING },
        partTitle:     { type: SchemaType.STRING },
        brands:        { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
      },
      required: [],
    },
    nextQuestion: { type: SchemaType.STRING },
    resolved:    { type: SchemaType.BOOLEAN },
    summary:     { type: SchemaType.STRING },
  },
  required: ["confidence", "entityType", "fields", "resolved", "summary"],
} as const;

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: InterviewRequest = await req.json();

    const model = genAI.getGenerativeModel({
      model: IDENTITY_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as never,
      },
    });

    // Build evidence summary for the prompt
    const ocrSummary = body.ocrResult
      ? JSON.stringify(body.ocrResult, null, 2)
      : "No OCR result yet.";

    const cueSummary = body.featureCues
      ? Object.entries(body.featureCues)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "none detected"
      : "none provided";

    const historyText = (body.history || [])
      .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
      .join("\n");

    const listingHint = body.partNumber
      ? `\nListing context: part number hint = ${body.partNumber}`
      : "";

    const systemPrompt = `You are an appliance identity verification engine for a parts resale platform.

Your goal: reach CONFIDENCE ≥ 0.92 to positively identify either:
1. WHOLE MACHINE — make, model, serial number, manufacture year/age
2. PART — part number, part title, compatible brand(s)

Rules:
- Assess all available evidence: OCR results, visual feature cues, and operator Q&A.
- Calculate a confidence score from 0.0 to 1.0 based on evidence quality.
- If confidence < 0.92 and < 5 questions have been asked, produce ONE targeted next question that would most increase confidence.
- Ask about the most specific evidence gap first (e.g., if model is known but serial is not, ask for serial).
- Questions must be short, plain-language, and directly actionable.
- Set resolved=true only when confidence >= 0.92.
- Set nextQuestion=null when resolved=true OR when 5+ questions have been asked with no further progress.
- Never ask for information you already have.
- Prefer machine identity if a nameplate is present; prefer part identity if no nameplate but product photo exists.
- entityType must be exactly "machine", "part", or "unknown".
- Return all currently known fields, even partial ones.
${listingHint}

Evidence:
OCR Result: ${ocrSummary}
Detected Feature Cues: ${cueSummary}
Prior Q&A:
${historyText || "(none yet)"}`;

    const contentParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: systemPrompt },
    ];

    if (body.nameplateBase64) {
      contentParts.push({
        inlineData: {
          mimeType: body.nameplateType || "image/jpeg",
          data: body.nameplateBase64,
        },
      });
    }

    if (body.productBase64) {
      contentParts.push({
        inlineData: {
          mimeType: body.productType || "image/jpeg",
          data: body.productBase64,
        },
      });
    }

    contentParts.push({ text: "Evaluate all evidence and return your structured assessment." });

    const result = await scheduleGeminiCall({
      tool: "identity",
      bucket: "lite",
      model: IDENTITY_MODEL,
      grounded: false,
      route: "app/api/identity/confidence-interview",
      requestId: body.partNumber,
      run: () => model.generateContent({ contents: [{ role: "user", parts: contentParts }] }),
    });
    const text = result.response.text();
    const parsed: InterviewResponse = JSON.parse(text);

    // Enforce resolved logic server-side
    if (parsed.confidence >= 0.92) {
      parsed.resolved = true;
      parsed.nextQuestion = null;
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[confidence-interview]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
