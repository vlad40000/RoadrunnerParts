import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");

const sql = neon(databaseUrl);

const rows = await sql`
  SELECT table_schema, table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    AND (
      table_name ILIKE '%appliance%'
      OR table_name ILIKE '%unit%'
      OR table_name ILIKE '%machine%'
      OR table_name ILIKE '%inventory%'
    )
  ORDER BY table_schema, table_name, ordinal_position
`;

const grouped = new Map();
for (const row of rows) {
  const key = `${row.table_schema}.${row.table_name}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(`${row.column_name}:${row.data_type}`);
}

console.log(JSON.stringify(Object.fromEntries(grouped), null, 2));
