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

const limit = Number(args.get("limit") || 6000);
const dryRun = args.get("dry-run") === "true";
const requestedTable = args.get("table");

const COLUMN_CANDIDATES = {
  machineId: ["id", "machine_id", "machineid", "unit_id", "appliance_unit_id"],
  brand: ["brand", "brand_raw", "manufacturer", "make"],
  model: ["model", "model_raw", "model_number", "modelnumber"],
  serial: ["serial", "serial_raw", "serial_number", "serialnumber"],
  condition: ["condition", "unit_condition", "status"],
};

function normalizeColumn(name) {
  return String(name || "").toLowerCase();
}

function pickColumn(columns, key) {
  const normalized = new Map(columns.map((column) => [normalizeColumn(column), column]));
  for (const candidate of COLUMN_CANDIDATES[key]) {
    const found = normalized.get(candidate);
    if (found) return found;
  }
  return null;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function resolveDecoderFamily(brand, model) {
  const b = String(brand || "").toLowerCase();
  const m = String(model || "").toUpperCase();
  if (b.includes("kenmore") || /^\d{3}\./.test(m)) {
    const prefix = m.split(".")[0];
    if (["106", "110", "665"].includes(prefix)) return "WHIRLPOOL_FAMILY";
    if (["587", "253", "417"].includes(prefix)) return "ELECTROLUX_FAMILY";
    if (["795", "796"].includes(prefix)) return "LG";
    if (["401", "592"].includes(prefix)) return "SAMSUNG";
    if (["363", "362", "911"].includes(prefix)) return "GE_FAMILY";
  }
  if (/(ge|general electric|hotpoint|haier|monogram|cafe)/i.test(b)) return "GE_FAMILY";
  if (/(whirlpool|kitchenaid|amana|roper|estate|admiral|inglis|jenn-?air)/i.test(b)) return "WHIRLPOOL_FAMILY";
  if (/maytag/i.test(b)) return "WHIRLPOOL_FAMILY";
  if (/(frigidaire|electrolux|tappan|kelvinator|gibson)/i.test(b)) return "ELECTROLUX_FAMILY";
  if (/\blg\b/i.test(b)) return "LG";
  if (/(bosch|thermador|gaggenau)/i.test(b)) return "BOSCH_BSH";
  if (/samsung/i.test(b)) return "SAMSUNG";
  if (/(alliance|speed queen|huebsch)/i.test(b)) return "ALLIANCE";
  return "UNKNOWN";
}

function resolvedOemBrand(brand, model) {
  const family = resolveDecoderFamily(brand, model);
  if (family === "GE_FAMILY") return "GE";
  if (family === "WHIRLPOOL_FAMILY") return "Whirlpool";
  if (family === "ELECTROLUX_FAMILY") return "Frigidaire";
  if (family === "LG") return "LG";
  if (family === "SAMSUNG") return "Samsung";
  if (family === "BOSCH_BSH") return "Bosch";
  if (family === "ALLIANCE") return "Alliance";
  return brand || null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isoWeekDate(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function manufactureDate(result) {
  const year = result.selectedYear;
  const time = result.timeValue;
  if (!year) return null;
  if (time?.unit === "month") return `${year}-${pad2(time.value)}-01`;
  if (time?.unit === "week") return isoWeekDate(year, time.value);
  return `${year}-01-01`;
}

function ageMonths(date) {
  if (!date) return null;
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return null;
  const now = new Date();
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

function ageBand(months) {
  if (months === null || months < 0) return "unknown";
  if (months < 48) return "current_recent";
  if (months < 96) return "strong_resale";
  if (months < 156) return "normal_used";
  if (months < 216) return "part_out_bias";
  return "scrap_or_legacy_parts";
}

function isJunk(condition) {
  return /\b(junk|scrap|recycle|trash|parts\s*only|salvage|destroyed)\b/i.test(String(condition || ""));
}

function queuePolicy({ band, condition, confidence }) {
  if (band === "current_recent") {
    return { score: 1000, queueBand: "current_recent", action: "inspect_first", msrp: true, reason: "0-3 years: inspect first and run MSRP lookup" };
  }
  if (band === "strong_resale") {
    return { score: 850, queueBand: "strong_resale", action: "inspect_first", msrp: true, reason: "4-7 years: strong resale; inspect first and run MSRP lookup" };
  }
  if (band === "normal_used") {
    const msrp = !isJunk(condition);
    return { score: msrp ? 650 : 550, queueBand: "normal_used", action: "evaluate_condition", msrp, reason: msrp ? "8-12 years: condition not junk; MSRP eligible" : "8-12 years: junk condition; skip MSRP" };
  }
  if (band === "part_out_bias") {
    return { score: 400, queueBand: "part_out_bias", action: "part_out_bias", msrp: false, reason: "13-17 years: skip MSRP unless high-demand model" };
  }
  if (band === "scrap_or_legacy_parts") {
    return { score: 150, queueBand: "scrap_or_legacy_parts", action: "scrap_or_legacy_parts", msrp: false, reason: "18+ years: skip MSRP unless known valuable parts unit" };
  }
  return { score: 0, queueBand: "manual_review", action: "manual_review", msrp: false, reason: "unknown: do not run valuation automation" };
}

async function ensureQueueTable() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS appliance_inventory_queue (
      machine_id text PRIMARY KEY,
      rank_score integer NOT NULL DEFAULT 0,
      queue_band text NOT NULL DEFAULT 'manual_review',
      recommended_action text NOT NULL DEFAULT 'manual_review',
      age_band text NOT NULL DEFAULT 'unknown',
      condition text,
      brand text,
      model text,
      serial text,
      decoded_age_months integer,
      msrp_lookup_eligible boolean NOT NULL DEFAULT false,
      ebay_survey_status text NOT NULL DEFAULT 'pending',
      production_decision_status text NOT NULL DEFAULT 'pending',
      decision_reason text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getTableColumns(tableName) {
  return sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
}

async function resolveSourceTable() {
  if (requestedTable) {
    const columns = (await getTableColumns(requestedTable)).map((row) => row.column_name);
    if (!columns.length) throw new Error(`${requestedTable} table not found in public schema`);
    return { tableName: requestedTable, columns };
  }

  for (const tableName of ["appliance_unit", "machine_inventory"]) {
    const columns = (await getTableColumns(tableName)).map((row) => row.column_name);
    if (columns.length) return { tableName, columns };
  }

  throw new Error("No appliance source table found. Expected appliance_unit or machine_inventory in public schema.");
}

async function loadRows() {
  const { tableName, columns } = await resolveSourceTable();

  const picked = {
    machineId: pickColumn(columns, "machineId"),
    brand: pickColumn(columns, "brand"),
    model: pickColumn(columns, "model"),
    serial: pickColumn(columns, "serial"),
    condition: pickColumn(columns, "condition"),
  };
  for (const required of ["machineId", "model", "serial"]) {
    if (!picked[required]) throw new Error(`appliance_unit missing required ${required} column`);
  }

  const selectList = Object.entries(picked)
    .filter(([, column]) => column)
    .map(([alias, column]) => `${quoteIdent(column)} AS ${quoteIdent(alias)}`)
    .join(", ");

  const rows = await sql.query(`
    SELECT ${selectList}
    FROM ${quoteIdent(tableName)}
    WHERE ${quoteIdent(picked.serial)} IS NOT NULL
    ORDER BY ${quoteIdent(picked.machineId)}
    LIMIT ${Math.max(1, Math.trunc(limit))}
  `);

  return { rows, picked, tableName };
}

async function decodeRows(rows) {
  const child = spawn("python", ["scripts/workers/appliance_age_decode_jsonl.py"], {
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
      machineId: row.machineId,
      brandFamily: resolveDecoderFamily(row.brand, row.model),
      serial: row.serial,
      model: row.model,
    })}\n`);
  }
  child.stdin.end();
  await once(child, "close");
  await waiting;
  return outputs.map((output, index) => ({ row: rows[index], output }));
}

async function persistResult(row, decoded, picked, tableName) {
  const result = decoded.result;
  const mfgDate = manufactureDate(result);
  const months = ageMonths(mfgDate);
  const band = ageBand(months);
  const policy = queuePolicy({ band, condition: row.condition, confidence: result.confidence });
  const manualReview = band === "unknown" || result.confidence === "low" || !result.selectedYear;
  const reviewReason = !result.selectedYear
    ? "serial_date_not_decoded"
    : result.confidence === "low"
      ? "low_decode_confidence"
      : band === "unknown"
        ? "unknown_age_band"
        : null;

  if (!dryRun) {
    await sql.query(
      `
        UPDATE ${quoteIdent(tableName)}
        SET
          resolved_oem_brand = $1,
          manufacturer_family = $2,
          decoded_year = $3,
          decoded_month = $4,
          decoded_week = $5,
          decoded_manufacture_date = $6,
          decoded_age_months = $7,
          decode_confidence = $8,
          decode_reason = $9,
          decode_rules_applied = $10::jsonb,
          decode_candidates = $11::jsonb,
          age_band = $12,
          age_band_status = $13,
          manual_review_required = $14,
          manual_review_reason = $15,
          age_band_checked_at = now()
        WHERE ${quoteIdent(picked.machineId)}::text = $16
      `,
      [
        resolvedOemBrand(row.brand, row.model),
        result.brandFamily || null,
        result.selectedYear || null,
        result.timeValue?.unit === "month" ? result.timeValue.value : null,
        result.timeValue?.unit === "week" ? result.timeValue.value : null,
        mfgDate,
        months,
        result.confidence || "none",
        result.resolutionReason || null,
        JSON.stringify(result.rulesApplied || []),
        JSON.stringify(result.remainingCandidates || []),
        band,
        manualReview ? "needs_review" : "decoded",
        manualReview,
        reviewReason,
        String(row.machineId),
      ],
    );

    await sql`
      INSERT INTO appliance_inventory_queue (
        machine_id, rank_score, queue_band, recommended_action, age_band,
        condition, brand, model, serial, decoded_age_months,
        msrp_lookup_eligible, ebay_survey_status, production_decision_status,
        decision_reason, updated_at
      )
      VALUES (
        ${String(row.machineId)}, ${policy.score}, ${policy.queueBand}, ${policy.action}, ${band},
        ${row.condition || null}, ${row.brand || null}, ${row.model || null}, ${row.serial || null}, ${months},
        ${policy.msrp}, 'pending', 'pending', ${policy.reason}, now()
      )
      ON CONFLICT (machine_id) DO UPDATE SET
        rank_score = EXCLUDED.rank_score,
        queue_band = EXCLUDED.queue_band,
        recommended_action = EXCLUDED.recommended_action,
        age_band = EXCLUDED.age_band,
        condition = EXCLUDED.condition,
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        serial = EXCLUDED.serial,
        decoded_age_months = EXCLUDED.decoded_age_months,
        msrp_lookup_eligible = EXCLUDED.msrp_lookup_eligible,
        decision_reason = EXCLUDED.decision_reason,
        updated_at = now()
    `;
  }

  return { machineId: row.machineId, model: row.model, ageBand: band, score: policy.score, action: policy.action, msrpLookupEligible: policy.msrp };
}

async function main() {
  await ensureQueueTable();
  const { rows, picked, tableName } = await loadRows();
  console.log(`Loaded ${rows.length} ${tableName} rows`);
  const decoded = await decodeRows(rows);
  const summary = { total: 0, decoded: 0, failed: 0, bands: {} };
  const ranked = [];

  for (const item of decoded) {
    summary.total += 1;
    if (!item.output.ok) {
      summary.failed += 1;
      continue;
    }
    const persisted = await persistResult(item.row, item.output, picked, tableName);
    summary.decoded += 1;
    summary.bands[persisted.ageBand] = (summary.bands[persisted.ageBand] || 0) + 1;
    ranked.push(persisted);
  }

  ranked.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify({ dryRun, ...summary, top: ranked.slice(0, 20) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
