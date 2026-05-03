import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");
}

const sql = neon(databaseUrl);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS bom_telemetry (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id text,
      event text NOT NULL,
      status text NOT NULL,
      model text,
      brand text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_job_id_idx ON bom_telemetry (job_id);`;
  await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_event_idx ON bom_telemetry (event);`;
  await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_created_at_idx ON bom_telemetry (created_at);`;
  console.log("bom_telemetry ensured");
}

main().catch((err) => {
  console.error("ensure-bom-telemetry failed:", err);
  process.exit(1);
});

