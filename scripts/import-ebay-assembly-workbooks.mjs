import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const DEFAULT_WORKBOOKS = [
  "C:/Users/bradv/Downloads/Backsplash_Blower_Drive_Assembly_Parts.xlsx",
  "C:/Users/bradv/Downloads/Front_Panel_Door_Parts.xlsx",
  "C:/Users/bradv/Downloads/Drum_Parts.xlsx",
  "C:/Users/bradv/Downloads/Cabinet_Top_Panel_Parts.xlsx",
];

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const scopePath = String(args.get("scope") || "scratch/current-ebay-scope.json");
const workbookArgs = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => path.resolve(arg));
const workbookPaths = workbookArgs.length > 0 ? workbookArgs : DEFAULT_WORKBOOKS;

function cleanPartNumber(value) {
  return String(value || "")
    .replace(/[^A-Z0-9-]/gi, "")
    .toUpperCase();
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

function titleFor(partNumber, partTitle) {
  const title = `GE ${partNumber} ${partTitle} Used Dryer Part`;
  return title.length <= 80 ? title : title.slice(0, 80).trim();
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
    });

    for (const row of sheetRows.slice(2)) {
      const [diagId, rawPartNumber, rawPartTitle, rawPrice] = row;
      const partNumber = cleanPartNumber(rawPartNumber);
      const partTitle = String(rawPartTitle || "").trim();
      const price = money(rawPrice);

      if (!partNumber || !partTitle) continue;
      if (partNumber === "PARTNUMBER" || /^diag\s*id$/i.test(String(diagId || ""))) continue;

      rows.push({
        partNumber,
        diagramId: String(diagId || "").trim(),
        partTitle,
        price,
        sourceWorkbook: path.basename(filePath),
        sourceSheet: sheetName,
      });
    }
  }

  return rows;
}

function buildWorkbookMap(paths) {
  const rows = paths.flatMap((filePath) => readWorkbookRows(filePath));
  const byPartNumber = new Map();
  const duplicates = [];

  for (const row of rows) {
    const existing = byPartNumber.get(row.partNumber);
    if (existing) {
      duplicates.push({ partNumber: row.partNumber, kept: existing, duplicate: row });
      continue;
    }
    byPartNumber.set(row.partNumber, row);
  }

  return { rows, byPartNumber, duplicates };
}

function updateListing(listing, workbookRow) {
  if (!workbookRow) return listing;

  const ebayBuyNow = workbookRow.price === null ? listing.ebayBuyNow : `$${workbookRow.price.toFixed(2)}`;
  const specs = {
    ...(listing.specs || {}),
    brand: listing.specs?.brand || "GE",
    mpn: listing.specs?.mpn || workbookRow.partNumber,
    type: workbookRow.partTitle,
    condition: listing.specs?.condition || "Used",
    diagramId: workbookRow.diagramId,
    supersedes: listing.supersedes || listing.specs?.supersedes || "",
    ebayBuyNow,
  };

  return {
    ...listing,
    diagramId: workbookRow.diagramId,
    diagId: workbookRow.diagramId,
    description: workbookRow.partTitle,
    partTitle: workbookRow.partTitle,
    title: titleFor(workbookRow.partNumber, workbookRow.partTitle),
    price: workbookRow.price ?? listing.price,
    ebayBuyNow,
    specs,
    assemblySource: {
      workbook: workbookRow.sourceWorkbook,
      sheet: workbookRow.sourceSheet,
    },
  };
}

const scope = JSON.parse(fs.readFileSync(scopePath, "utf8"));
const { rows, byPartNumber, duplicates } = buildWorkbookMap(workbookPaths);
const parts = Array.isArray(scope.parts) ? scope.parts : [];
const listings = Array.isArray(scope.listings) ? scope.listings : [];
const activePartNumbers = new Set(parts.map((part) => cleanPartNumber(part.partNumber)));
const matchedPartNumbers = [];

scope.parts = parts.map((part) => {
  const partNumber = cleanPartNumber(part.partNumber);
  const workbookRow = byPartNumber.get(partNumber);
  if (workbookRow) matchedPartNumbers.push(partNumber);
  return updateListing(part, workbookRow);
});

scope.listings = listings.map((listing) => {
  const partNumber = cleanPartNumber(listing.partNumber);
  return updateListing(listing, byPartNumber.get(partNumber));
});

scope.generatedAt = new Date().toISOString();
scope.assemblyWorkbookImport = {
  importedAt: scope.generatedAt,
  workbookCount: workbookPaths.length,
  workbookRows: rows.length,
  uniqueWorkbookPartCount: byPartNumber.size,
  activeMatchedCount: new Set(matchedPartNumbers).size,
  activeMissingFromWorkbooks: [...activePartNumbers]
    .filter((partNumber) => !byPartNumber.has(partNumber))
    .sort(),
  workbookPartsOutsideActiveScope: [...byPartNumber.keys()]
    .filter((partNumber) => !activePartNumbers.has(partNumber))
    .sort(),
  duplicateWorkbookRows: duplicates.map((item) => ({
    partNumber: item.partNumber,
    kept: {
      workbook: item.kept.sourceWorkbook,
      sheet: item.kept.sourceSheet,
      diagramId: item.kept.diagramId,
      partTitle: item.kept.partTitle,
      price: item.kept.price,
    },
    duplicate: {
      workbook: item.duplicate.sourceWorkbook,
      sheet: item.duplicate.sourceSheet,
      diagramId: item.duplicate.diagramId,
      partTitle: item.duplicate.partTitle,
      price: item.duplicate.price,
    },
  })),
};

fs.writeFileSync(scopePath, `${JSON.stringify(scope, null, 2)}\n`);

console.log(JSON.stringify(scope.assemblyWorkbookImport, null, 2));
