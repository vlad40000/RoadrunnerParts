import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type EbayImportRow = {
  model: string;
  partNumber: string;
  price: number;
  priceUrl: string | null;
  rawModel: string;
};

const HEADER_ALIASES: Record<string, string[]> = {
  model: ["model", "model number", "model_number", "normalized model", "normalized_model"],
  partNumber: ["part number", "part_number", "oem number", "oem_number", "oem identifier", "part", "pn"],
  price: [
    "ebay price",
    "ebay_price",
    "price",
    "manual ebay price",
    "manual_ebay_price",
    "ebay manual price",
    "ebay manual price usd",
  ],
  priceUrl: [
    "ebay url",
    "ebay_url",
    "url",
    "listing url",
    "listing_url",
    "price url",
    "price_url",
    "ebay price url",
  ],
};

function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getField(row: Record<string, unknown>, key: keyof typeof HEADER_ALIASES): string {
  const aliases = HEADER_ALIASES[key];
  const rowKeys = Object.keys(row || {});
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const matchingKey = rowKeys.find((candidate) => normalizeHeader(candidate) === normalizedAlias);
    if (!matchingKey) continue;
    const value = row[matchingKey];
    return value !== undefined && value !== null ? String(value).trim() : "";
  }
  return "";
}

function normalizeModel(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePartNumber(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parsePrice(value: string): number | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[$,]/g, ""));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const match = text.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const fallback = Number(match[1]);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function toNullableUrl(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function isPlaceholderEbayUrl(value: string | null) {
  const url = String(value || "").trim();
  if (!url) return false;
  return /^https?:\/\/(?:www\.)?ebay\.com\/itm\/test(?:[-/?#]|$)/i.test(url);
}

async function resolveModelId(
  modelIdCache: Map<string, string>,
  normalizedModel: string,
  rawModel: string,
) {
  const cached = modelIdCache.get(normalizedModel);
  if (cached) return cached;

  const existing = await sql`
    select id::text as id
    from appliance_models
    where normalized_model = ${normalizedModel}
    limit 1
  `;
  const existingRows = (Array.isArray(existing) ? existing : [existing]) as Array<{ id?: string }>;
  if (existingRows[0]?.id) {
    modelIdCache.set(normalizedModel, existingRows[0].id);
    return existingRows[0].id;
  }

  const inserted = await sql`
    insert into appliance_models (
      normalized_model,
      raw_model,
      retrieval_state,
      updated_at
    ) values (
      ${normalizedModel},
      ${rawModel || normalizedModel},
      'manual_ebay_pricing_imported',
      now()
    )
    on conflict (normalized_model) do update set
      updated_at = now()
    returning id::text as id
  `;
  const insertedRows = (Array.isArray(inserted) ? inserted : [inserted]) as Array<{ id?: string }>;
  const id = String(insertedRows[0]?.id || "");
  if (!id) throw new Error(`Failed to resolve model id for ${normalizedModel}`);
  modelIdCache.set(normalizedModel, id);
  return id;
}

async function upsertEbayPricingRows(rows: EbayImportRow[]) {
  const modelIdCache = new Map<string, string>();

  for (const row of rows) {
    const modelId = await resolveModelId(modelIdCache, row.model, row.rawModel);
    await sql`
      insert into part_pricing (
        model_id,
        source,
        part_number,
        price,
        currency,
        availability,
        price_url,
        captured_at
      ) values (
        ${modelId}::uuid,
        'ebay.com',
        ${row.partNumber},
        ${row.price},
        'USD',
        'manual_upload',
        ${row.priceUrl},
        now()
      )
      on conflict (model_id, source, part_number) do update set
        price = excluded.price,
        currency = excluded.currency,
        availability = excluded.availability,
        price_url = excluded.price_url,
        captured_at = now()
    `;
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = String(request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const requestedModel = normalizeModel(String(body?.model || ""));
      const partNumber = normalizePartNumber(String(body?.partNumber || ""));
      const parsedPrice = parsePrice(String(body?.price ?? ""));
      const rawPriceUrl = String(body?.priceUrl || "");
      const priceUrl = toNullableUrl(rawPriceUrl);

      if (!requestedModel) {
        return NextResponse.json({ ok: false, error: "Model is required." }, { status: 400 });
      }
      if (!partNumber) {
        return NextResponse.json({ ok: false, error: "Part number is required." }, { status: 400 });
      }
      if (parsedPrice === null) {
        return NextResponse.json({ ok: false, error: "Valid eBay price is required." }, { status: 400 });
      }
      if (rawPriceUrl.trim() && !priceUrl) {
        return NextResponse.json({ ok: false, error: "Listing URL must start with http:// or https://." }, { status: 400 });
      }
      if (isPlaceholderEbayUrl(priceUrl)) {
        return NextResponse.json({ ok: false, error: "Use a real eBay listing URL." }, { status: 400 });
      }

      await upsertEbayPricingRows([
        {
          model: requestedModel,
          rawModel: requestedModel,
          partNumber,
          price: parsedPrice,
          priceUrl,
        },
      ]);

      return NextResponse.json({
        ok: true,
        importedRows: 1,
        model: requestedModel,
        partNumber,
        price: parsedPrice,
        priceUrl,
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestedModel = normalizeModel(String(formData.get("model") || ""));

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return NextResponse.json({ ok: false, error: "No worksheet found in upload." }, { status: 400 });
    }

    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    if (rawRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Spreadsheet has no rows." }, { status: 400 });
    }

    const warnings: string[] = [];
    const candidateRows: EbayImportRow[] = [];
    for (let index = 0; index < rawRows.length; index += 1) {
      const row = rawRows[index];
      const rowModelRaw = getField(row, "model");
      const rowModel = normalizeModel(rowModelRaw) || requestedModel;
      const partNumber = normalizePartNumber(getField(row, "partNumber"));
      const parsedPrice = parsePrice(getField(row, "price"));
      const rawPriceUrl = getField(row, "priceUrl");
      const priceUrl = toNullableUrl(rawPriceUrl);

      if (!rowModel) {
        warnings.push(`Row ${index + 2}: missing model.`);
        continue;
      }
      if (!partNumber) {
        warnings.push(`Row ${index + 2}: missing part number.`);
        continue;
      }
      if (parsedPrice === null) {
        warnings.push(`Row ${index + 2}: missing/invalid eBay price.`);
        continue;
      }

      candidateRows.push({
        model: rowModel,
        rawModel: rowModelRaw || rowModel,
        partNumber,
        price: parsedPrice,
        priceUrl: isPlaceholderEbayUrl(priceUrl) ? null : priceUrl,
      });
    }

    if (candidateRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows found in upload.", warnings },
        { status: 400 },
      );
    }

    // Keep one row per model+part, last row wins to match spreadsheet-edit expectations.
    const dedupedMap = new Map<string, EbayImportRow>();
    for (const row of candidateRows) {
      dedupedMap.set(`${row.model}|${row.partNumber}`, row);
    }
    const rows = Array.from(dedupedMap.values());

    await upsertEbayPricingRows(rows);

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      sheetName,
      rowCount: rawRows.length,
      validRows: candidateRows.length,
      importedRows: rows.length,
      model: requestedModel || null,
      warnings,
    });
  } catch (error) {
    console.error("[ebay-pricing/import] error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to import eBay pricing." },
      { status: 500 },
    );
  }
}
