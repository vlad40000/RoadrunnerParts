import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import fs from "node:fs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/apply-sql-file.mjs <path-to-sql>");

const sql = neon(databaseUrl);
const text = fs.readFileSync(file, "utf8");
const statements = text
  .split(/;\s*(?:\r?\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`applied ${statements.length} statements from ${file}`);
