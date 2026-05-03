import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });
dotenv.config();

function normalizeModelKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function countIfTableExists(sql, tableName, query, params) {
  const exists = await sql.query("select to_regclass($1) as table_name", [tableName]);
  if (!exists[0]?.table_name) return null;
  const rows = await sql.query(query, params);
  return Number(rows[0]?.count ?? rows[0]?.rows ?? 0);
}

async function main() {
  const model = normalizeModelKey(process.argv[2]);
  if (!model) throw new Error("Usage: node scripts/verify-db-model.mjs <model>");
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");

  const sql = neon(process.env.DATABASE_URL);
  const cacheRows = await sql.query(
    "select jsonb_array_length(parts) as rows from model_parts_cache where normalized_model = $1",
    [model],
  );

  const rawRows = await countIfTableExists(
    sql,
    "model_parts_raw",
    "select count(*) from model_parts_raw where canonical_model = $1",
    [model],
  );
  const providerRows = await countIfTableExists(
    sql,
    "provider_part_seed_rows",
    "select count(*) from provider_part_seed_rows where model = $1",
    [model],
  );

  console.log(JSON.stringify({
    model,
    model_parts_cache_rows: Number(cacheRows[0]?.rows ?? 0),
    model_parts_raw_rows: rawRows,
    provider_part_seed_rows: providerRows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
