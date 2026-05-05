import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type InventoryMachine = {
  id: string;
  brand: string;
  model: string;
  type: string;
  score: number;
  action: string;
  value: number;
  status: string;
  serial?: string;
  location?: string;
  condition?: string;
  raw: Record<string, any>;
};

const MAX_IMPORT_ROWS = 10000;

const HEADER_ALIASES: Record<string, string[]> = {
  action: ["action", "recommended action", "recommended_action", "disposition", "disposition recommendation"],
  brand: ["brand", "make", "manufacturer"],
  condition: ["condition", "tested condition", "tested_condition"],
  id: ["id", "machine id", "machine_id", "machine code", "machine_code", "asset", "asset tag", "asset_tag"],
  location: ["location", "warehouse location", "warehouse_location", "bin", "zone"],
  model: ["model", "model number", "model_number", "normalized model", "normalized_model", "modelnumber"],
  score: ["score", "priority score", "priority_score", "ranking score", "ranking_score"],
  serial: ["serial", "serial number", "serial_number", "serialnumber"],
  status: ["status", "bom status", "bom_status", "retrieval state", "retrieval_state", "availability"],
  type: ["type", "appliance type", "appliance_type", "product type", "product_type", "appliancetype"],
  value: ["value", "market value", "market_value", "valuation", "msrp", "original msrp", "original_msrp"],
};

function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getField(row: Record<string, any>, targetKey: keyof typeof HEADER_ALIASES): string {
  const aliases = HEADER_ALIASES[targetKey];
  const rowKeys = Object.keys(row);

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const matchingKey = rowKeys.find(k => normalizeHeader(k) === normalizedAlias);

    if (matchingKey !== undefined) {
      const val = row[matchingKey];
      return val !== undefined && val !== null ? String(val).trim() : "";
    }
  }
  return "";
}

function parseNumber(value: string): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullable(value: string): string | null {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return NextResponse.json(
        { ok: false, error: `Sheet "${sheetName}" not found in the workbook.` },
        { status: 400 }
      );
    }

    // Convert sheet to JSON with row objects
    const rawRows = xlsx.utils.sheet_to_json(sheet) as any[];

    if (rawRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Spreadsheet is empty or has no data rows." },
        { status: 400 }
      );
    }

    const warnings: string[] = [];
    const machines: InventoryMachine[] = rawRows
      .slice(0, MAX_IMPORT_ROWS)
      .map((row, index) => {
        const model = getField(row, "model");
        if (!model) {
          warnings.push(`Row ${index + 2}: Missing model, skipping row.`);
          return null;
        }

        const brand = getField(row, "brand") || "Unknown";
        const id = getField(row, "id") || `${model}-${index + 1}`;

        return {
          id,
          brand,
          model,
          type: getField(row, "type") || "Unknown",
          score: parseNumber(getField(row, "score")),
          action: getField(row, "action") || "review",
          value: parseNumber(getField(row, "value")),
          status: getField(row, "status") || "imported",
          serial: getField(row, "serial") || undefined,
          location: getField(row, "location") || undefined,
          condition: getField(row, "condition") || undefined,
          raw: row,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    if (rawRows.length > MAX_IMPORT_ROWS) {
      warnings.push(`Imported the first ${MAX_IMPORT_ROWS.toLocaleString()} rows only.`);
    }

    // Process in batches of 200 to balance speed and payload size
    const BATCH_SIZE = 200;
    for (let i = 0; i < machines.length; i += BATCH_SIZE) {
      const batch = machines.slice(i, i + BATCH_SIZE);

      // Note: Assuming a bulk helper or using individual calls within a transaction.
      // For the most robust Neon performance, use a transaction:
      await Promise.all(batch.map(machine =>
        sql`
          INSERT INTO machine_inventory (
            machine_code,
            brand,
            model,
            serial,
            appliance_type,
            condition,
            location,
            disposition_recommendation,
            priority_score,
            original_msrp,
            whole_machine_status,
            raw,
            updated_at
          )
          VALUES (
            ${machine.id},
            ${nullable(machine.brand)},
            ${machine.model},
            ${nullable(machine.serial || "")},
            ${nullable(machine.type)},
            ${nullable(machine.condition || "")},
            ${nullable(machine.location || "")},
            ${nullable(machine.action)},
            ${machine.score},
            ${machine.value},
            ${nullable(machine.status)},
            ${JSON.stringify(machine.raw)}::jsonb,
            now()
          )
        ON CONFLICT (machine_code) WHERE machine_code IS NOT NULL
        DO UPDATE SET
          brand = EXCLUDED.brand,
          model = EXCLUDED.model,
          serial = EXCLUDED.serial,
          appliance_type = EXCLUDED.appliance_type,
          condition = EXCLUDED.condition,
          location = EXCLUDED.location,
          disposition_recommendation = EXCLUDED.disposition_recommendation,
          priority_score = EXCLUDED.priority_score,
          original_msrp = EXCLUDED.original_msrp,
          whole_machine_status = EXCLUDED.whole_machine_status,
          raw = EXCLUDED.raw,
          updated_at = now()
        `
      ));
    }

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      rowCount: rawRows.length,
      importedCount: machines.length,
      machines,
      warnings,
    });
  } catch (error) {
    console.error("Inventory Import Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to parse the spreadsheet." },
      { status: 500 }
    );
  }
}
