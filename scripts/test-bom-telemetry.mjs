import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");
}

const sql = neon(databaseUrl);

async function main() {
  const jobId = `telemetry_probe_${Date.now()}`;
  await sql`
    insert into bom_telemetry (job_id, event, status, model, brand, payload)
    values (
      ${jobId},
      'encompass_hardened_path_blocked',
      'failed',
      'DCR032A2BDB',
      'Danby',
      ${JSON.stringify({ provider: "probe", reason: "manual verification" })}::jsonb
    )
  `;

  const rows = await sql`
    select job_id, event, status, model, brand, created_at
    from bom_telemetry
    where job_id = ${jobId}
    order by created_at desc
    limit 1
  `;

  console.log(JSON.stringify({ inserted: rows.length, row: rows[0] ?? null }, null, 2));
}

main().catch((err) => {
  console.error("test-bom-telemetry failed:", err);
  process.exit(1);
});

