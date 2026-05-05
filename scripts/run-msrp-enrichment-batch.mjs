import { neon } from "@neondatabase/serverless";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");

const sql = neon(databaseUrl);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const limit = Number(args.get("limit") || 100);
const dryRun = args.get("dry-run") === "true";

async function loadEligibleRows() {
  const rows = await sql.query(`
    SELECT 
      q.machine_id, 
      q.model, 
      m.decoded_manufacture_date,
      m.brand
    FROM appliance_inventory_queue q
    JOIN machine_inventory m ON q.machine_id = m.id::text
    WHERE q.msrp_lookup_eligible = true
      AND m.original_msrp IS NULL
    LIMIT $1
  `, [limit]);
  return rows;
}

async function runMsrpWorker(rows) {
  const child = spawn("python", ["scripts/workers/msrp_finder_jsonl.py"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
  });
  
  const rl = createInterface({ input: child.stdout });
  const outputs = [];
  const waiting = (async () => {
    for await (const line of rl) outputs.push(JSON.parse(line));
  })();

  for (const row of rows) {
    child.stdin.write(`${JSON.stringify({
      machineId: row.machine_id,
      model: row.model,
      target_date: row.decoded_manufacture_date,
      // We could add mfr_domains here based on brand if needed
    })}\n`);
  }
  child.stdin.end();
  await once(child, "close");
  await waiting;
  return outputs;
}

async function updateMsrpResults(results) {
  for (const result of results) {
    if (result.error) {
      console.error(`Error for ${result.machineId}: ${result.error}`);
      continue;
    }
    
    const msrp = result.msrp_result.msrp;
    const confidence = result.msrp_result.confidence;
    const note = result.msrp_result.note;
    
    if (dryRun) {
      console.log(`[DRY RUN] Machine ${result.machineId}: MSRP=${msrp}, Confidence=${confidence}`);
      continue;
    }
    
    await sql.query(`
      UPDATE machine_inventory
      SET 
        original_msrp = $1,
        msrp_confidence = $2,
        raw = raw || jsonb_build_object('msrp_note', $3::text)
      WHERE id::text = $4
    `, [msrp, confidence, note, result.machineId]);
    
    // Also update queue if needed
    await sql.query(`
      UPDATE appliance_inventory_queue
      SET updated_at = now()
      WHERE machine_id = $1
    `, [result.machineId]);
  }
}

async function main() {
  console.log("Loading MSRP eligible rows...");
  const rows = await loadEligibleRows();
  console.log(`Loaded ${rows.length} rows.`);
  
  if (rows.length === 0) return;
  
  console.log("Running MSRP worker...");
  const results = await runMsrpWorker(rows);
  
  console.log("Updating results...");
  await updateMsrpResults(results);
  console.log("Done.");
}

main().catch(console.error);
