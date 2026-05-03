import "dotenv/config";
import fs from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

function normalizeModelKey(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeSection(value) {
  return String(value || "").trim();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length) {
    throw new Error("Usage: node scripts/import-roadrunner-bom-json.mjs <combined-json> [--source <label>]");
  }

  const source = "roadrunner-bom-import";
  return { filePath: args[0], source };
}

async function main() {
  const { filePath, source } = parseArgs(process.argv);
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);

  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const db = drizzle(neon(process.env.DATABASE_URL));
  const models = Array.isArray(data.models) ? data.models : [];
  let insertedRaw = 0;
  let upsertedCache = 0;

  for (const modelEntry of models) {
    const canonicalModel = normalizeModelKey(modelEntry.model_number || modelEntry.model || "");
    if (!canonicalModel) continue;

    const parts = Array.isArray(modelEntry.parts) ? modelEntry.parts : [];
    const partsJson = JSON.stringify(parts);

    await db.execute(sql`
      INSERT INTO model_parts_cache (
        id,
        normalized_model,
        brand,
        category,
        parts,
        is_exhaustive,
        retrieval_state,
        expected_parts_total,
        trusted_total_part_count,
        actual_canonical_part_count,
        actual_unique_parts,
        parts_complete,
        truth_source,
        source_strategy,
        source_summary,
        validation_version,
        created_at,
        updated_at
      ) VALUES (
        ${canonicalModel},
        ${canonicalModel},
        ${modelEntry.brand || null},
        ${modelEntry.category || null},
        ${partsJson}::jsonb,
        ${"true"},
        ${"imported"},
        ${parts.length},
        ${parts.length},
        ${parts.length},
        ${parts.length},
        ${true},
        ${"Imported JSON"},
        ${source},
        ${JSON.stringify([{ source_file: data.combined_json || null, record_count: parts.length }])}::jsonb,
        ${"json-import-v1"},
        now(),
        now()
      )
      ON CONFLICT (normalized_model) DO UPDATE SET
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        parts = EXCLUDED.parts,
        is_exhaustive = EXCLUDED.is_exhaustive,
        retrieval_state = EXCLUDED.retrieval_state,
        expected_parts_total = EXCLUDED.expected_parts_total,
        trusted_total_part_count = EXCLUDED.trusted_total_part_count,
        actual_canonical_part_count = EXCLUDED.actual_canonical_part_count,
        actual_unique_parts = EXCLUDED.actual_unique_parts,
        parts_complete = EXCLUDED.parts_complete,
        truth_source = EXCLUDED.truth_source,
        source_strategy = EXCLUDED.source_strategy,
        source_summary = EXCLUDED.source_summary,
        validation_version = EXCLUDED.validation_version,
        updated_at = now();
    `);
    upsertedCache += 1;

    for (const part of parts) {
      const refId = String(part.ref_id || part.refId || "").trim();
      const partNumber = String(part.part_number || part.partNumber || "").trim().toUpperCase();
      const description = String(part.description || part.partName || "").trim();
      const section = normalizeSection(part.assembly_section || part.section || part.section_name || "");
      const payload = JSON.stringify(part);

      if (!partNumber && !description) continue;

      await db.execute(sql`
        INSERT INTO model_parts_raw (
          canonical_model,
          source,
          section_name,
          raw_part_number,
          raw_part_name,
          raw_payload
        ) VALUES (
          ${canonicalModel},
          ${String(part.price_source || part.priceSource || source || "imported")},
          ${section},
          ${partNumber || null},
          ${description || null},
          ${payload}::jsonb
        )
        ON CONFLICT DO NOTHING;
      `);
      insertedRaw += 1;
    }
  }

  console.log(JSON.stringify({
    filePath,
    models: models.length,
    rawRowsWritten: insertedRaw,
    cacheRowsUpserted: upsertedCache,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
