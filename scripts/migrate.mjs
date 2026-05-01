import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function run() {
  const migrationPath = join(process.cwd(), "drizzle", "0004_bom_jobs_expected_parts.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  console.log("Applying migration 0004...");
  
  // neon-http doesn't support multiple statements in one call easily if they are complex, 
  // but for ALTER TABLE ADD COLUMN it should work if we split by semicolon.
  const statements = migrationSql
    .split(";")
    .map(s => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    console.log(`Executing: ${statement}`);
    await sql.query(statement);
  }

  console.log("Migration applied successfully!");
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
