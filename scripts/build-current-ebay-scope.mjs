import fs from "fs";
import path from "path";

const DEFAULT_INPUT = "C:\\Users\\bradv\\OneDrive\\Attachments\\Documents\\ebay pricing .csv";
const DEFAULT_OUTPUT = "scratch/current-ebay-scope.json";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const outputPath = String(args.get("output") || DEFAULT_OUTPUT);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function parsePrice(value) {
  const amount = Number(String(value || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid price value: ${value}`);
  }
  return amount;
}

function makeTitle(part) {
  const label = part.description || "Appliance Part";
  const title = `GE ${part.partNumber} ${label} Used Dryer Part`;
  return title.length <= 80 ? title : `GE ${part.partNumber} ${label} Used Part`.slice(0, 80).trim();
}

const raw = fs.readFileSync(inputPath, "utf8").trim();
const lines = raw.split(/\r?\n/).filter((line) => line.trim());
const headers = parseCsvLine(lines[0]).map(normalizeHeader);
const seen = new Set();

const parts = lines.slice(1).map((line, rowIndex) => {
  const values = parseCsvLine(line);
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] || "";
  });

  const partNumber = String(row.partnumber || "").trim().toUpperCase();
  if (!partNumber) throw new Error(`Missing partNumber at row ${rowIndex + 2}`);
  if (seen.has(partNumber)) throw new Error(`Duplicate partNumber in current eBay scope: ${partNumber}`);
  seen.add(partNumber);

  return {
    partNumber,
    diagramId: String(row.diagramid || "").trim(),
    description: String(row.description || "").trim(),
    supersedes: String(row.supersedes || "").trim(),
    price: parsePrice(row.price),
  };
});

const listings = parts.map((part) => ({
  ...part,
  diagId: part.diagramId,
  partTitle: part.description,
  title: makeTitle(part),
  ebayBuyNow: `$${part.price.toFixed(2)}`,
  specs: {
    brand: "GE",
    mpn: part.partNumber,
    type: part.description,
    condition: "Used",
    diagramId: part.diagramId,
    supersedes: part.supersedes,
    ebayBuyNow: `$${part.price.toFixed(2)}`,
  },
}));

const payload = {
  generatedAt: new Date().toISOString(),
  sourceCsv: inputPath,
  usageBoundary:
    "Current eBay listing scope only. Do not generate listings, image searches, mockups, prompt-chain pages, or marketplace drafts for parts outside this file unless the operator replaces the scope.",
  activePartCount: parts.length,
  parts,
  listings,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log(`Current eBay scope written to ${outputPath}`);
console.log(`Active parts: ${parts.length}`);
