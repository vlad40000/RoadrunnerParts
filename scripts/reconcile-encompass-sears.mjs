import "dotenv/config";
import { neon } from "@neondatabase/serverless";

function normalizeModel(input) {
  return String(input || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePartNumber(input) {
  return String(input || "").trim().toUpperCase();
}

function isEncompassSource(source) {
  const s = String(source || "").toLowerCase();
  return s.includes("encompass");
}

function isSearsSource(source) {
  const s = String(source || "").toLowerCase();
  return s.includes("sears");
}

function usage() {
  console.log("Usage: node scripts/reconcile-encompass-sears.mjs <MODEL>");
}

async function main() {
  const modelArg = process.argv[2];
  const model = normalizeModel(modelArg);
  if (!model) {
    usage();
    process.exit(1);
  }

  const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");
  }
  const sql = neon(databaseUrl);

  const rows = await sql`
    select
      source,
      section_name,
      diagram_ref,
      raw_part_number,
      raw_part_name
    from model_parts_raw
    where canonical_model = ${model}
    order by created_at desc
  `;

  const encompass = new Map();
  const sears = new Map();

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.raw_part_number);
    if (!partNumber) continue;
    const payload = {
      partNumber,
      description: String(row.raw_part_name || "").trim(),
      section: String(row.section_name || "").trim(),
      diagramRef: String(row.diagram_ref || "").trim(),
      source: String(row.source || ""),
    };

    if (isEncompassSource(row.source) && !encompass.has(partNumber)) {
      encompass.set(partNumber, payload);
    }
    if (isSearsSource(row.source) && !sears.has(partNumber)) {
      sears.set(partNumber, payload);
    }
  }

  const encompassOnly = [];
  const searsOnly = [];
  const descriptionMismatch = [];
  const overlap = [];

  for (const [partNumber, e] of encompass.entries()) {
    const s = sears.get(partNumber);
    if (!s) {
      encompassOnly.push(e);
      continue;
    }
    overlap.push(partNumber);
    if (
      e.description &&
      s.description &&
      e.description.toLowerCase() !== s.description.toLowerCase()
    ) {
      descriptionMismatch.push({
        partNumber,
        encompassDescription: e.description,
        searsDescription: s.description,
      });
    }
  }

  for (const [partNumber, s] of sears.entries()) {
    if (!encompass.has(partNumber)) {
      searsOnly.push(s);
    }
  }

  const report = {
    model,
    encompassCount: encompass.size,
    searsCount: sears.size,
    overlapCount: overlap.length,
    discrepancyCount:
      encompassOnly.length + searsOnly.length + descriptionMismatch.length,
    encompassOnly,
    searsOnly,
    descriptionMismatch,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("[reconcile-encompass-sears] failed:", err);
  process.exit(1);
});

