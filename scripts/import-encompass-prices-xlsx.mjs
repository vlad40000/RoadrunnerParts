import dotenv from "dotenv";
import XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });
dotenv.config();

function normalizeModel(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePart(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseMoney(value) {
  const text = String(value || "").trim();
  const match = text.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function requiredString(row, key) {
  return String(row[key] || "").trim();
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((arg) => !arg.startsWith("--"));
  const zipIndex = args.indexOf("--zip");
  const zipPath = zipIndex >= 0 ? args[zipIndex + 1] : null;
  if (!filePath) {
    throw new Error("Usage: node scripts/import-encompass-prices-xlsx.mjs <xlsx-file> [--zip <source-photo-zip>]");
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets.Matched_Unique;
  if (!sheet) throw new Error("Workbook is missing Matched_Unique sheet.");

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  const sql = neon(databaseUrl);

  let processed = 0;
  let imported = 0;
  let skippedNoPrice = 0;
  let skippedNoPart = 0;
  let reviewImported = 0;

  for (const row of rows) {
    const normalizedModel = normalizeModel(row.Model_Number);
    const partNumber = normalizePart(row.Part_Number);
    const price = parseMoney(row.Part_Price);

    if (!normalizedModel || !partNumber) {
      skippedNoPart += 1;
      continue;
    }
    if (price === null) {
      skippedNoPrice += 1;
      continue;
    }

    processed += 1;
    const needsReview = requiredString(row, "Needs_Review").toUpperCase() === "YES";
    const priceUrl =
      requiredString(row, "Partstore_View_URL") ||
      requiredString(row, "Exploded_View_URL") ||
      null;
    const sourceUrl = requiredString(row, "Exploded_View_URL") || priceUrl;
    const availability = needsReview
      ? "operator_review_required"
      : "verified_image_url_context";

    const [model] = await sql`
      insert into appliance_models (
        normalized_model,
        raw_model,
        brand,
        brand_code,
        product_type,
        retrieval_state,
        updated_at
      ) values (
        ${normalizedModel},
        ${requiredString(row, "Model_Number") || normalizedModel},
        ${requiredString(row, "Brand") || null},
        'HOT',
        ${requiredString(row, "Type") || null},
        'encompass_price_evidence_imported',
        now()
      )
      on conflict (normalized_model) do update set
        brand = coalesce(appliance_models.brand, excluded.brand),
        brand_code = coalesce(appliance_models.brand_code, excluded.brand_code),
        product_type = coalesce(appliance_models.product_type, excluded.product_type),
        updated_at = now()
      returning id
    `;

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
        ${model.id},
        'encompass.com',
        ${partNumber},
        ${price},
        'USD',
        ${availability},
        ${priceUrl},
        now()
      )
      on conflict (model_id, source, part_number) do update set
        price = excluded.price,
        currency = excluded.currency,
        availability = excluded.availability,
        price_url = excluded.price_url,
        captured_at = now()
    `;

    await sql`
      insert into model_parts_raw (
        canonical_model,
        source,
        section_name,
        diagram_ref,
        raw_part_number,
        raw_part_name,
        raw_payload
      )
      select
        ${normalizedModel},
        'encompass.com',
        ${requiredString(row, "Assembly_Group") || null},
        ${requiredString(row, "Diagram_ID") || null},
        ${partNumber},
        ${requiredString(row, "Part_Title") || null},
        ${JSON.stringify({
          source_type: "operator_screenshot_encompass_price",
          confidence: row.Confidence,
          needs_review: row.Needs_Review,
          notes: row.Notes,
          part_price: row.Part_Price,
          parsed_price: price,
          price_source: "encompass.com",
          price_url: priceUrl,
          source_url: sourceUrl,
          source_image_files: row.Source_Image_Files,
          workbook: filePath,
          source_photo_zip: zipPath,
        })}::jsonb
      where not exists (
        select 1
        from model_parts_raw
        where canonical_model = ${normalizedModel}
          and source = 'encompass.com'
          and raw_part_number = ${partNumber}
          and diagram_ref is not distinct from ${requiredString(row, "Diagram_ID") || null}
          and section_name is not distinct from ${requiredString(row, "Assembly_Group") || null}
          and raw_payload ->> 'source_type' = 'operator_screenshot_encompass_price'
      )
    `;

    imported += 1;
    if (needsReview) reviewImported += 1;
  }

  console.log(JSON.stringify({
    filePath,
    sheet: "Matched_Unique",
    rows: rows.length,
    processed,
    imported,
    reviewImported,
    skippedNoPrice,
    skippedNoPart,
    sourcePhotoZip: zipPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
