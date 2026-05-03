import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

function normalizeModel(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const files = process.argv.slice(2);
  if (!files.length) {
    throw new Error("Pass one or more Encompass model URL JSON files.");
  }

  const db = drizzle(neon(databaseUrl));

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS encompass_model_urls (
      id BIGSERIAL PRIMARY KEY,
      brand TEXT,
      encompass_route TEXT NOT NULL,
      encompass_id TEXT NOT NULL,
      model_number TEXT NOT NULL,
      encoded_model_number TEXT NOT NULL,
      normalized_model TEXT NOT NULL,
      url TEXT NOT NULL,
      source_file TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS encompass_model_urls_normalized_model_route_idx
    ON encompass_model_urls (normalized_model, encompass_route, encompass_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS encompass_model_urls_normalized_model_idx
    ON encompass_model_urls (normalized_model)
  `);

  for (const file of files) {
    const raw = await fs.readFile(path.resolve(file), "utf8");
    const rows = JSON.parse(raw);

    if (!Array.isArray(rows)) {
      throw new Error(`${file} is not a JSON array.`);
    }

    for (const row of rows) {
      const modelNumber = String(row.model_number || "").trim();
      const encodedModelNumber = String(row.encoded_model_number || modelNumber).trim();
      const normalizedModel = normalizeModel(modelNumber);

      if (!normalizedModel || !row.url || !row.encompass_id) continue;

      await db.execute(sql`
        INSERT INTO encompass_model_urls (
          brand,
          encompass_route,
          encompass_id,
          model_number,
          encoded_model_number,
          normalized_model,
          url,
          source_file
        )
        VALUES (
          ${row.brand ?? null},
          ${row.encompass_route ?? "WHI"},
          ${String(row.encompass_id)},
          ${modelNumber},
          ${encodedModelNumber},
          ${normalizedModel},
          ${String(row.url)},
          ${path.basename(file)}
        )
        ON CONFLICT DO NOTHING
      `);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
