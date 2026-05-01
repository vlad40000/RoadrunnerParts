import { NextRequest, NextResponse } from "next/server";
import { inflateRawSync } from "node:zlib";

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
  raw: Record<string, string>;
};

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const MAX_IMPORT_ROWS = 10000;

const HEADER_ALIASES: Record<string, Array<string>> = {
  action: ["action", "recommended action", "recommended_action", "disposition", "disposition recommendation"],
  brand: ["brand", "make", "manufacturer"],
  condition: ["condition", "tested condition"],
  id: ["id", "machine id", "machine_id", "machine code", "machine_code", "asset", "asset tag"],
  location: ["location", "warehouse location", "bin", "zone"],
  model: ["model", "model number", "model_number", "normalized model", "normalized_model"],
  score: ["score", "priority score", "priority_score", "ranking score"],
  serial: ["serial", "serial number", "serial_number"],
  status: ["status", "bom status", "bom_status", "retrieval state", "retrieval_state"],
  type: ["type", "appliance type", "appliance_type", "product type", "product_type"],
  value: ["value", "market value", "market_value", "valuation", "msrp", "original msrp", "original_msrp"],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-/]+/g, " ");
}

function getField(row: Record<string, string>, key: keyof typeof HEADER_ALIASES): string {
  const aliases = HEADER_ALIASES[key];

  for (const alias of aliases) {
    const value = row[alias];

    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function parseNumber(value: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDelimited(text: string, delimiter?: "," | "\t"): Array<Array<string>> {
  const resolvedDelimiter = delimiter ?? (text.split("\n", 1)[0]?.includes("\t") ? "\t" : ",");
  const rows: Array<Array<string>> = [];
  let current = "";
  let row: Array<string> = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && char === resolvedDelimiter) {
      row.push(current);
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function rowsToRecords(rows: Array<Array<string>>): Array<Record<string, string>> {
  const [headerRow, ...bodyRows] = rows;

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map(normalizeHeader);

  return bodyRows.map((cells) => {
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      if (header) {
        record[header] = cells[index]?.trim() ?? "";
      }
    });

    return record;
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function columnIndex(cellReference: string): number {
  const letters = cellReference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return Math.max(0, index - 1);
}

function findZipEntries(buffer: Buffer): Array<ZipEntry> {
  const endSearchStart = Math.max(0, buffer.length - 66000);
  let endOffset = -1;

  for (let offset = buffer.length - 22; offset >= endSearchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset === -1) {
    throw new Error("Unable to read XLSX zip directory.");
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  const entries: Array<ZipEntry> = [];
  let offset = directoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid XLSX zip directory.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): string {
  const headerOffset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(headerOffset) !== 0x04034b50) {
    throw new Error(`Invalid XLSX local file header for ${entry.name}.`);
  }

  const fileNameLength = buffer.readUInt16LE(headerOffset + 26);
  const extraLength = buffer.readUInt16LE(headerOffset + 28);
  const dataStart = headerOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed.toString("utf8");
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed, {
      finishFlush: 2,
      maxOutputLength: Math.max(entry.uncompressedSize, 1024),
    }).toString("utf8");
  }

  throw new Error(`Unsupported XLSX compression method ${entry.compressionMethod}.`);
}

function parseSharedStrings(xml: string): Array<string> {
  return Array.from(xml.matchAll(/<si[\s\S]*?<\/si>/g)).map(([item]) => {
    const text = Array.from(item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1] ?? ""))
      .join("");

    return text.trim();
  });
}

function parseWorksheetRows(xml: string, sharedStrings: Array<string>): Array<Array<string>> {
  return Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).map((rowMatch) => {
    const cells: Array<string> = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = attributes.match(/\br="([^"]+)"/)?.[1] ?? "";
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const index = columnIndex(ref);
      let value = "";

      if (type === "inlineStr") {
        value = Array.from(body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
          .map((match) => decodeXml(match[1] ?? ""))
          .join("");
      } else {
        const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";

        if (type === "s") {
          value = sharedStrings[Number(rawValue)] ?? "";
        } else if (type === "b") {
          value = rawValue === "1" ? "TRUE" : "FALSE";
        } else {
          value = decodeXml(rawValue);
        }
      }

      cells[index] = value.trim();
    }

    return cells;
  });
}

function parseXlsx(buffer: Buffer): Array<Record<string, string>> {
  const entries = findZipEntries(buffer);
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const sharedStringsEntry = entryMap.get("xl/sharedStrings.xml");
  const sheetEntry =
    entryMap.get("xl/worksheets/sheet1.xml") ??
    entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));

  if (!sheetEntry) {
    throw new Error("No worksheet found in XLSX file.");
  }

  const sharedStrings = sharedStringsEntry
    ? parseSharedStrings(readZipEntry(buffer, sharedStringsEntry))
    : [];

  const worksheetXml = readZipEntry(buffer, sheetEntry);
  return rowsToRecords(parseWorksheetRows(worksheetXml, sharedStrings));
}

function recordsToMachines(records: Array<Record<string, string>>): {
  machines: Array<InventoryMachine>;
  warnings: Array<string>;
} {
  const warnings: Array<string> = [];
  const machines = records.slice(0, MAX_IMPORT_ROWS).flatMap((record, index) => {
    const model = getField(record, "model");

    if (!model) {
      warnings.push(`Row ${index + 2} skipped: missing model.`);
      return [];
    }

    const brand = getField(record, "brand") || "Unknown";
    const id = getField(record, "id") || `${model}-${index + 1}`;

    return [
      {
        id,
        brand,
        model,
        type: getField(record, "type") || "Unknown",
        score: parseNumber(getField(record, "score")),
        action: getField(record, "action") || "review",
        value: parseNumber(getField(record, "value")),
        status: getField(record, "status") || "imported",
        serial: getField(record, "serial") || undefined,
        location: getField(record, "location") || undefined,
        condition: getField(record, "condition") || undefined,
        raw: record,
      },
    ];
  });

  if (records.length > MAX_IMPORT_ROWS) {
    warnings.push(`Imported the first ${MAX_IMPORT_ROWS.toLocaleString()} rows only.`);
  }

  return { machines, warnings };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || file.size === 0) {
      return NextResponse.json({ error: "Upload a CSV, TSV, or XLSX inventory file." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const records =
      name.endsWith(".xlsx")
        ? parseXlsx(buffer)
        : rowsToRecords(parseDelimited(buffer.toString("utf8").replace(/^\uFEFF/, "")));

    const result = recordsToMachines(records);

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      rowCount: records.length,
      importedCount: result.machines.length,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inventory import failed.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 },
    );
  }
}
