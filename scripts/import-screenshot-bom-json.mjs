import fs from "node:fs/promises";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });
dotenv.config();

function normalizeModelKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeSourceUrl(value) {
  return String(value || "").trim();
}

function normalizePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sectionFamily(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cachePart(row) {
  const price = normalizePrice(row.price ?? row.part_price);
  const originalPartNumber = String(row.part_number || row.partNumber || "").trim().toUpperCase();
  const currentServicePartNumber = String(
    row.current_service_part_number || row.currentServicePartNumber || row.replaced_by || originalPartNumber,
  )
    .trim()
    .toUpperCase();

  return {
    ...row,
    section: row.section || row.assembly_section || null,
    diagramNumber: row.diagram_number ?? null,
    partNumber: originalPartNumber,
    originalPartNumber,
    currentServicePartNumber,
    description: row.description || row.part_title || null,
    price,
    priceSource: price ? "searspartsdirect.com" : null,
    retailPrice: price,
    retailPriceSource: price ? "searspartsdirect.com" : null,
    retailPriceVerified: Boolean(price),
    availability: row.availability || null,
    sourceUrl: row.sourceUrl || row.source_url || null,
  };
}

async function tableColumns(sql, tableName) {
  const rows = await sql.query(
    "select column_name from information_schema.columns where table_name = $1 order by ordinal_position",
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function ensureProviderSeedTables(sql) {
  await sql.query(`
    create table if not exists provider_model_routes (
      id bigserial primary key,
      manufacturer_family text,
      brand text,
      brand_code text,
      model text not null,
      model_family text,
      appliance_type text,
      fuel_type text,
      serial_prefix text,
      provider text not null,
      provider_model_url text,
      provider_option_value text,
      provider_assembly_url text,
      source_status text,
      source_file text,
      source_row integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create unique index if not exists provider_model_routes_unq_idx
    on provider_model_routes (provider, model, coalesce(provider_option_value, ''))
  `);

  await sql.query(`
    create table if not exists provider_assembly_sections (
      id bigserial primary key,
      manufacturer_family text,
      brand text,
      brand_code text,
      model text not null,
      model_family text,
      appliance_type text,
      fuel_type text,
      serial_prefix text,
      provider text not null,
      provider_option_value text,
      provider_assembly_url text,
      diagram_url text,
      section_seq integer,
      section_label_raw text,
      section_name_clean text,
      normalized_section text,
      section_family text,
      image_url text,
      source_status text,
      source_file text,
      source_row integer,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create unique index if not exists provider_assembly_sections_unq_idx
    on provider_assembly_sections (
      provider,
      model,
      coalesce(provider_option_value, ''),
      coalesce(section_seq, -1),
      coalesce(section_name_clean, '')
    )
  `);

  await sql.query(`
    create table if not exists provider_part_seed_rows (
      id bigserial primary key,
      manufacturer_family text,
      brand text,
      brand_code text,
      model text not null,
      model_family text,
      appliance_type text,
      fuel_type text,
      serial_prefix text,
      provider text not null,
      provider_model_url text,
      provider_assembly_url text,
      diagram_url text,
      section_label_raw text,
      section_name_clean text,
      normalized_section text,
      section_family text,
      diagram_number text,
      original_part_number text,
      current_service_part_number text,
      description text,
      nla_status boolean default false,
      replacement_note text,
      image_url text,
      source_status text,
      source_file text,
      source_row integer,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create unique index if not exists provider_part_seed_rows_unq_idx
    on provider_part_seed_rows (
      provider,
      model,
      coalesce(section_name_clean, ''),
      coalesce(diagram_number, ''),
      coalesce(current_service_part_number, original_part_number, '')
    )
  `);
}

function pickFields(columns, values) {
  return Object.entries(values).filter(([column]) => columns.has(column));
}

async function upsertModelPartsCache(sql, columns, modelEntry, parts, filePath) {
  const normalizedModel = normalizeModelKey(modelEntry.model_number || modelEntry.model);
  const cacheParts = parts.map(cachePart).filter((part) => part.price && part.priceSource);
  const uniquePartCount = new Set(cacheParts.map((part) => part.partNumber)).size;

  const fields = pickFields(columns, {
    id: normalizedModel,
    normalized_model: normalizedModel,
    brand: modelEntry.brand || null,
    category: modelEntry.category || null,
    parts: JSON.stringify(cacheParts),
    is_exhaustive: "true",
    retrieval_state: "imported",
    expected_parts_total: cacheParts.length,
    expected_parts_source: "sears-partsdirect-screenshot",
    trusted_total_part_count: cacheParts.length,
    trusted_total_count_source: "sears-partsdirect",
    trusted_total_count_source_url: modelEntry.source_url || null,
    actual_canonical_part_count: uniquePartCount,
    actual_unique_parts: uniquePartCount,
    coverage_pct: uniquePartCount ? Math.min(1, uniquePartCount / cacheParts.length) : null,
    parts_complete: true,
    truth_source: modelEntry.source_url || null,
    source_strategy: "sears-partsdirect-screenshot-import",
    source_summary: JSON.stringify([
      {
        source_file: filePath,
        raw_rows: parts.length,
        cache_rows: cacheParts.length,
        unique_part_numbers: uniquePartCount,
      },
    ]),
    validation_version: "screenshot-import-v1",
    appliance_type: "dryer",
    last_verified_at: new Date(),
    updated_at: new Date(),
    created_at: new Date(),
  });

  const columnNames = fields.map(([column]) => column);
  const params = fields.map(([, value]) => value);
  const placeholders = fields.map(([column], index) => {
    const placeholder = `$${index + 1}`;
    return column === "parts" || column === "source_summary"
      ? `${placeholder}::jsonb`
      : placeholder;
  });
  const updates = columnNames
    .filter((column) => column !== "id" && column !== "normalized_model" && column !== "created_at")
    .map((column) => `${column} = excluded.${column}`);

  await sql.query(
    `insert into model_parts_cache (${columnNames.join(", ")})
     values (${placeholders.join(", ")})
     on conflict (normalized_model) do update set ${updates.join(", ")}`,
    params,
  );

  return { cacheRows: cacheParts.length, cacheUniqueParts: uniquePartCount };
}

async function insertRawRows(sql, columns, modelEntry, parts) {
  if (!columns.size) return 0;

  const normalizedModel = normalizeModelKey(modelEntry.model_number || modelEntry.model);
  let written = 0;

  for (const row of parts) {
    const originalPartNumber = String(row.part_number || row.partNumber || "").trim().toUpperCase();
    if (!originalPartNumber && !row.description && !row.part_title) continue;

    const fields = pickFields(columns, {
      canonical_model: normalizedModel,
      source: "searspartsdirect.com",
      section_name: row.section || row.assembly_section || null,
      diagram_ref: row.diagram_number ? String(row.diagram_number) : null,
      provider_item_id: row.row_id ? String(row.row_id) : null,
      raw_part_number: originalPartNumber || null,
      raw_part_name: row.description || row.part_title || null,
      raw_category: row.availability || null,
      quantity: "1",
      substitute_part_number: row.replaced_by || row.current_service_part_number || null,
      serial_note: row.review_flag || null,
      raw_payload: JSON.stringify(row),
    });

    const columnNames = fields.map(([column]) => column);
    const params = fields.map(([, value]) => value);
    const placeholders = fields.map(([column], index) => {
      const placeholder = `$${index + 1}`;
      return column === "raw_payload" ? `${placeholder}::jsonb` : placeholder;
    });
    const whereStart = params.length + 1;
    const whereParts = [
      `canonical_model = $${whereStart}`,
      `source = $${whereStart + 1}`,
      `raw_part_number is not distinct from $${whereStart + 2}`,
      `diagram_ref is not distinct from $${whereStart + 3}`,
      `section_name is not distinct from $${whereStart + 4}`,
    ];
    params.push(
      normalizedModel,
      "searspartsdirect.com",
      originalPartNumber || null,
      row.diagram_number ? String(row.diagram_number) : null,
      row.section || row.assembly_section || null,
    );

    if (columns.has("provider_item_id")) {
      whereParts.push(`provider_item_id is not distinct from $${whereStart + 5}`);
      params.push(row.row_id ? String(row.row_id) : null);
    }

    const result = await sql.query(
      `insert into model_parts_raw (${columnNames.join(", ")})
       select ${placeholders.join(", ")}
       where not exists (
         select 1 from model_parts_raw
         where ${whereParts.join(" and ")}
       )`,
      params,
    );
    written += result.rowCount ?? 0;
  }

  return written;
}

async function upsertProviderSeeds(sql, modelEntry, parts, filePath) {
  const normalizedModel = normalizeModelKey(modelEntry.model_number || modelEntry.model);
  const provider = "sears-partsdirect";
  const modelUrl = normalizeSourceUrl(modelEntry.source_url);
  let routes = 0;
  let sections = 0;
  let rows = 0;

  await sql.query(
    `insert into provider_model_routes (
       manufacturer_family, brand, brand_code, model, model_family,
       appliance_type, fuel_type, serial_prefix, provider,
       provider_model_url, provider_option_value, provider_assembly_url,
       source_status, source_file, source_row
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )
     on conflict (provider, model, coalesce(provider_option_value, '')) do update set
       provider_model_url = excluded.provider_model_url,
       provider_assembly_url = excluded.provider_assembly_url,
       updated_at = now()`,
    [
      "ge-family",
      modelEntry.brand || "Hotpoint",
      "HOT",
      normalizedModel,
      normalizedModel,
      "dryer",
      null,
      null,
      provider,
      modelUrl,
      null,
      modelUrl,
      "operator_screenshot",
      filePath,
      0,
    ],
  );
  routes = 1;

  const seenSections = new Map();
  for (const row of parts) {
    const label = String(row.section || row.assembly_section || "All Model Parts").trim();
    if (!seenSections.has(label)) seenSections.set(label, row);
  }

  let sectionSeq = 1;
  for (const [label, row] of seenSections) {
    await sql.query(
      `insert into provider_assembly_sections (
         manufacturer_family, brand, brand_code, model, model_family,
         appliance_type, fuel_type, serial_prefix, provider,
         provider_option_value, provider_assembly_url, diagram_url,
         section_seq, section_label_raw, section_name_clean,
         normalized_section, section_family, image_url,
         source_status, source_file, source_row
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
       )
       on conflict (provider, model, coalesce(provider_option_value, ''), coalesce(section_seq, -1), coalesce(section_name_clean, '')) do update set
         provider_assembly_url = excluded.provider_assembly_url,
         diagram_url = excluded.diagram_url,
         image_url = excluded.image_url`,
      [
        "ge-family",
        modelEntry.brand || "Hotpoint",
        "HOT",
        normalizedModel,
        normalizedModel,
        "dryer",
        null,
        null,
        provider,
        null,
        row.source_url || modelUrl,
        row.source_url || modelUrl,
        sectionSeq,
        label,
        label,
        sectionFamily(label),
        sectionFamily(label),
        null,
        "operator_screenshot",
        filePath,
        row.row_id || sectionSeq,
      ],
    );
    sections += 1;
    sectionSeq += 1;
  }

  for (const row of parts) {
    const originalPartNumber = String(row.part_number || "").trim().toUpperCase();
    const currentServicePartNumber = String(
      row.current_service_part_number || row.replaced_by || originalPartNumber,
    )
      .trim()
      .toUpperCase();
    const label = String(row.section || row.assembly_section || "All Model Parts").trim();
    const nlaStatus = /^no longer made/i.test(String(row.availability || ""));

    await sql.query(
      `insert into provider_part_seed_rows (
         manufacturer_family, brand, brand_code, model, model_family,
         appliance_type, fuel_type, serial_prefix, provider,
         provider_model_url, provider_assembly_url, diagram_url,
         section_label_raw, section_name_clean, normalized_section,
         section_family, diagram_number, original_part_number,
         current_service_part_number, description, nla_status,
         replacement_note, image_url, source_status, source_file, source_row
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24, $25, $26
       )
       on conflict (provider, model, coalesce(section_name_clean, ''), coalesce(diagram_number, ''), coalesce(current_service_part_number, original_part_number, '')) do update set
         description = excluded.description,
         nla_status = excluded.nla_status,
         replacement_note = excluded.replacement_note,
         image_url = excluded.image_url`,
      [
        "ge-family",
        modelEntry.brand || "Hotpoint",
        "HOT",
        normalizedModel,
        normalizedModel,
        "dryer",
        null,
        null,
        provider,
        modelUrl,
        row.source_url || modelUrl,
        row.source_url || modelUrl,
        label,
        label,
        sectionFamily(label),
        sectionFamily(label),
        row.diagram_number ? String(row.diagram_number) : null,
        originalPartNumber || null,
        currentServicePartNumber || originalPartNumber || null,
        row.description || row.part_title || null,
        nlaStatus,
        row.replaced_by ? `Replaced by ${row.replaced_by}` : nlaStatus ? "No substitute part" : null,
        null,
        row.review_flag || "operator_screenshot",
        filePath,
        row.row_id || null,
      ],
    );
    rows += 1;
  }

  return { providerRoutes: routes, providerSections: sections, providerRows: rows };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: node scripts/import-screenshot-bom-json.mjs <json-file>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  const sql = neon(process.env.DATABASE_URL);
  const cacheColumns = await tableColumns(sql, "model_parts_cache");
  const rawColumns = await tableColumns(sql, "model_parts_raw");
  await ensureProviderSeedTables(sql);
  const providerPartColumns = await tableColumns(sql, "provider_part_seed_rows");

  const summary = [];
  for (const modelEntry of Array.isArray(data.models) ? data.models : []) {
    const parts = Array.isArray(modelEntry.parts) ? modelEntry.parts : [];
    const cache = await upsertModelPartsCache(sql, cacheColumns, modelEntry, parts, filePath);
    const rawRowsWritten = await insertRawRows(sql, rawColumns, modelEntry, parts);
    const provider = providerPartColumns.size
      ? await upsertProviderSeeds(sql, modelEntry, parts, filePath)
      : { providerRoutes: 0, providerSections: 0, providerRows: 0 };

    summary.push({
      model: normalizeModelKey(modelEntry.model_number || modelEntry.model),
      rawInputRows: parts.length,
      rawRowsWritten,
      ...cache,
      ...provider,
    });
  }

  console.log(JSON.stringify({ filePath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
