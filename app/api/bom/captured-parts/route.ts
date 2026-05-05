import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

const ConfidenceSchema = z.object({
  callout: z.number().min(0).max(1).nullable().optional(),
  partNumber: z.number().min(0).max(1).nullable().optional(),
  description: z.number().min(0).max(1).nullable().optional(),
  price: z.number().min(0).max(1).nullable().optional()
});

const CapturedPartSchema = z.object({
  source: z.literal("encompass").default("encompass"),
  sourceUrl: z.string().url(),

  modelNumber: z.string().nullable().optional(),
  diagramName: z.string().nullable().optional(),

  callout: z.string().nullable().optional(),
  partNumber: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),

  rawText: z.string().nullable().optional(),
  cropImageUrl: z.string().nullable().optional(),

  confidence: ConfidenceSchema.nullable().optional()
});

const PushPayloadSchema = z.object({
  sourceUrl: z.string().url(),
  modelNumber: z.string().nullable().optional(),
  diagramName: z.string().nullable().optional(),
  rows: z.array(CapturedPartSchema).min(1)
});

function cleanText(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function makeDedupeKey(input: {
  source: string;
  modelNumber?: string | null;
  diagramName?: string | null;
  callout?: string | null;
  partNumber?: string | null;
}) {
  return [
    input.source,
    input.modelNumber ?? "",
    input.diagramName ?? "",
    input.callout ?? "",
    input.partNumber ?? ""
  ]
    .join("|")
    .toUpperCase();
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function POST(req: NextRequest) {
  try {
    const ingestKey = req.headers.get("x-bom-ingest-key");

    if (
      process.env.BOM_CAPTURE_INGEST_KEY &&
      ingestKey !== process.env.BOM_CAPTURE_INGEST_KEY
    ) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await req.json();
    const payload = PushPayloadSchema.parse(body);

    const sessionRows = await sql`
      insert into bom_capture_session (
        source,
        source_url,
        model_number,
        diagram_name
      )
      values (
        'encompass',
        ${payload.sourceUrl},
        ${cleanText(payload.modelNumber)},
        ${cleanText(payload.diagramName)}
      )
      returning id
    `;

    const sessionId = sessionRows[0].id as string;

    const inserted: unknown[] = [];

    for (const row of payload.rows) {
      const modelNumber = cleanText(row.modelNumber ?? payload.modelNumber);
      const diagramName = cleanText(row.diagramName ?? payload.diagramName);
      const callout = cleanText(row.callout);
      const partNumber = cleanText(row.partNumber);

      const dedupeKey = makeDedupeKey({
        source: "encompass",
        modelNumber,
        diagramName,
        callout,
        partNumber
      });

      const result = await sql`
        insert into bom_captured_part (
          session_id,
          source,
          source_url,
          model_number,
          diagram_name,
          callout,
          part_number,
          description,
          price,
          availability,
          raw_text,
          crop_image_url,
          confidence_callout,
          confidence_part_number,
          confidence_description,
          confidence_price,
          review_status,
          dedupe_key
        )
        values (
          ${sessionId},
          'encompass',
          ${row.sourceUrl},
          ${modelNumber},
          ${diagramName},
          ${callout},
          ${partNumber},
          ${cleanText(row.description)},
          ${cleanText(row.price)},
          ${cleanText(row.availability)},
          ${cleanText(row.rawText)},
          ${cleanText(row.cropImageUrl)},
          ${row.confidence?.callout ?? null},
          ${row.confidence?.partNumber ?? null},
          ${row.confidence?.description ?? null},
          ${row.confidence?.price ?? null},
          'reviewed',
          ${dedupeKey}
        )
        on conflict (dedupe_key)
        do update set
          session_id = excluded.session_id,
          source_url = excluded.source_url,
          description = excluded.description,
          price = excluded.price,
          availability = excluded.availability,
          raw_text = excluded.raw_text,
          crop_image_url = excluded.crop_image_url,
          confidence_callout = excluded.confidence_callout,
          confidence_part_number = excluded.confidence_part_number,
          confidence_description = excluded.confidence_description,
          confidence_price = excluded.confidence_price,
          review_status = 'reviewed',
          updated_at = now()
        returning *
      `;

      inserted.push(result[0]);
    }

    return NextResponse.json(
      {
        ok: true,
        sessionId,
        count: inserted.length,
        rows: inserted
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error("Push captured BOM rows failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.BOM_EXTENSION_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-bom-ingest-key"
  };
}
