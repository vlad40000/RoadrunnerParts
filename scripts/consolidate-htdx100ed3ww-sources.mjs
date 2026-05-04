import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, "data", "imports");

const INPUTS = {
  completeBomCsv: "C:/Users/bradv/Downloads/HTDX100ED3WW_complete_BOM.csv",
  searsScreenshotJson: path.join(
    repoRoot,
    "data",
    "imports",
    "htdx100ed3ww-sears-screenshot-2026-05-02.json",
  ),
  searsCatalogCapture: "C:/Users/bradv/Downloads/sears catalog 1.txt",
  priceComparisonText: "C:/Users/bradv/Downloads/HTDX100ED3WW_BOM.csv.txt",
};

const MODEL_NUMBER = "HTDX100ED3WW";
const OUTPUT_STEM = "htdx100ed3ww-consolidated-parts-2026-05-04";
const SEARS_MODEL_URL =
  "https://www.searspartsdirect.com/model/4x4e8wp29p-001811/hotpoint-htdx100ed3ww-dryer-parts";
const GE_MODEL_URL =
  "https://www.geapplianceparts.com/store/parts/assembly/HTDX100ED3WW";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function parseMoney(value) {
  const s = clean(value).replace(/[$,]/g, "");
  if (!s) return null;
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body
    .filter((cells) => cells.some((cell) => clean(cell)))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [clean(header), cells[index] ?? ""])),
    );
}

function parseSearsCatalogCapture(filePath) {
  if (!fs.existsSync(filePath)) return { model: null, firstPageParts: [] };
  const html = fs.readFileSync(filePath, "utf8");
  const marker = "window.CATALOG_API_RESPONSE =";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return { model: null, firstPageParts: [] };

  const start = html.indexOf("{", markerIndex);
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) return { model: null, firstPageParts: [] };
  const payload = JSON.parse(html.slice(start, end));
  const objects = Object.values(payload);
  const model = objects.find((value) => value?.__typename === "Model" && value.number);
  const partResultKey = model
    ? Object.keys(model).find((key) => key.startsWith("parts("))
    : null;
  const partRefs = partResultKey && Array.isArray(model[partResultKey]?.parts)
    ? model[partResultKey].parts.map((ref) => ref.__ref).filter(Boolean)
    : [];

  const firstPageParts = partRefs
    .map((ref) => payload[ref])
    .filter((part) => part?.__typename === "Part")
    .map((part) => {
      const substitutionKey = Object.keys(part).find((key) => key.startsWith("substitutedByList("));
      const substitutionRef = part[substitutionKey]?.parts?.[0]?.__ref;
      const substitution = substitutionRef ? payload[substitutionRef] : null;
      return {
        section: clean(part.contextSchematicTitle || "All Model Parts"),
        diagramNumber: clean(part.contextSchematicKeyId || ""),
        originalPartNumber: upper(part.number),
        currentServicePartNumber: upper(substitution?.number || part.number),
        description: clean(part.title),
        price: typeof part.pricing?.sell === "number" ? part.pricing.sell : null,
        availability: clean(part.pricing?.availabilityInfo?.status),
        source: "sears_catalog_api_capture",
      };
    });

  return {
    model: model
      ? {
          id: model.id,
          modelNumber: model.number,
          expectedPartsTotal: model[partResultKey]?.totalCount ?? null,
          source: "window.CATALOG_API_RESPONSE",
        }
      : null,
    firstPageParts,
  };
}

function loadCompleteBomRows(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8")).map((row, index) => ({
    rowId: index + 1,
    section: clean(row.Section),
    diagramNumber: clean(row["Diagram Number"]),
    originalPartNumber: upper(row["Original Part Number"]),
    currentServicePartNumber: upper(row["Current Service Part Number"] || row["Original Part Number"]),
    description: clean(row.Description),
    nlaStatus: /^yes$/i.test(clean(row["NLA Status"])),
    source: "ge_appliance_parts_complete_bom_csv",
    sourceUrl: GE_MODEL_URL,
  }));
}

function loadSearsRows(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return payload.models[0].parts.map((row) => ({
    rowId: row.row_id ?? null,
    section: clean(row.section || row.assembly_section),
    diagramNumber: clean(row.diagram_number),
    originalPartNumber: upper(row.part_number || row.partNumber),
    currentServicePartNumber: upper(
      row.current_service_part_number || row.replaced_by || row.part_number || row.partNumber,
    ),
    description: clean(row.description || row.part_title),
    price: typeof row.price === "number" ? row.price : parseMoney(row.part_price),
    priceSource: clean(row.price_source || "searspartsdirect.com"),
    availability: clean(row.availability),
    reviewFlag: clean(row.review_flag) || null,
    source: "sears_partsdirect_screenshot_json",
    sourceUrl: clean(row.sourceUrl || row.source_url || SEARS_MODEL_URL),
  }));
}

function loadPriceComparisonRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const csvStart = text.indexOf("Part Number,Description,Encompass Price,Sears Price,Delta");
  if (csvStart < 0) return [];
  return parseCsv(text.slice(csvStart)).map((row) => ({
    partNumber: upper(row["Part Number"]),
    description: clean(row.Description),
    encompassPrice: parseMoney(row["Encompass Price"]),
    searsPrice: parseMoney(row["Sears Price"]),
    delta: parseMoney(row.Delta),
    source: "operator_price_comparison_csv",
  }));
}

function rowKey(row) {
  return [upper(row.section), upper(row.diagramNumber), upper(row.originalPartNumber)].join("|");
}

function partNumberKey(row) {
  return upper(row.originalPartNumber || row.partNumber);
}

function currentPartNumberKey(row) {
  return upper(row.currentServicePartNumber || row.originalPartNumber || row.partNumber);
}

function normalizeSection(section) {
  const s = upper(section);
  if (s.includes("BACKSPLASH") || s.includes("BLOWER") || s.includes("DRIVE")) {
    return "Backsplash, Blower and Drive Assembly";
  }
  if (s.includes("FRONT") || s.includes("DOOR")) return "Front Panel and Door";
  if (s.includes("CABINET") || s.includes("TOP")) return "Cabinet and Top Panel";
  if (s.includes("DRUM")) return "Drum";
  if (s.includes("SEE ALL")) return "See All Related Diagrams";
  return clean(section) || "General Assembly";
}

function chooseDescription(...values) {
  return values
    .map(clean)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";
}

function mergeSources({ completeRows, searsRows, apiRows, priceRows }) {
  const byRowKey = new Map();
  const searsByOriginal = new Map();
  const searsByCurrent = new Map();
  const apiByOriginal = new Map();
  const apiByCurrent = new Map();
  const pricesByPart = new Map();

  for (const row of searsRows) {
    const original = partNumberKey(row);
    const current = currentPartNumberKey(row);
    if (!searsByOriginal.has(original)) searsByOriginal.set(original, []);
    if (!searsByCurrent.has(current)) searsByCurrent.set(current, []);
    searsByOriginal.get(original).push(row);
    searsByCurrent.get(current).push(row);
  }

  for (const row of apiRows) {
    const original = partNumberKey(row);
    const current = currentPartNumberKey(row);
    if (!apiByOriginal.has(original)) apiByOriginal.set(original, []);
    if (!apiByCurrent.has(current)) apiByCurrent.set(current, []);
    apiByOriginal.get(original).push(row);
    apiByCurrent.get(current).push(row);
  }

  for (const row of priceRows) {
    if (row.partNumber) pricesByPart.set(row.partNumber, row);
  }

  function buildMerged(baseRow, origin) {
    const original = partNumberKey(baseRow);
    const current = currentPartNumberKey(baseRow);
    const matchedSears = [
      ...(searsByOriginal.get(original) || []),
      ...(searsByCurrent.get(current) || []),
    ].filter((row, index, self) => self.findIndex((candidate) => rowKey(candidate) === rowKey(row)) === index);
    const matchedApi = [
      ...(apiByOriginal.get(original) || []),
      ...(apiByCurrent.get(current) || []),
    ].filter((row, index, self) => self.findIndex((candidate) => rowKey(candidate) === rowKey(row)) === index);
    const priceEvidence = pricesByPart.get(original) || pricesByPart.get(current) || null;
    const primarySears = matchedSears.find((row) => !row.reviewFlag) || matchedSears[0] || null;
    const primaryApi = matchedApi[0] || null;
    const searsPrice =
      primarySears?.price ??
      primaryApi?.price ??
      priceEvidence?.searsPrice ??
      null;
    const encompassPrice = priceEvidence?.encompassPrice ?? null;
    const flags = [];

    if (!matchedSears.length) flags.push("missing_from_sears_rendered_rows");
    if (origin !== "complete_bom_csv") flags.push("not_in_complete_bom_csv");
    if (matchedSears.some((row) => row.reviewFlag)) flags.push("has_duplicate_rendered_sears_rows");
    if (baseRow.currentServicePartNumber !== (primarySears?.currentServicePartNumber || baseRow.currentServicePartNumber)) {
      flags.push("current_service_part_differs_by_source");
    }
    if (baseRow.nlaStatus === true && primarySears?.availability && !/no longer|nla/i.test(primarySears.availability)) {
      flags.push("nla_status_conflict");
    }
    if (priceEvidence?.searsPrice && primarySears?.price && priceEvidence.searsPrice !== primarySears.price) {
      flags.push("sears_price_conflict");
    }

    return {
      section: normalizeSection(baseRow.section || primarySears?.section || primaryApi?.section),
      sectionOriginal: baseRow.section || primarySears?.section || primaryApi?.section || null,
      diagramNumber: clean(baseRow.diagramNumber || primarySears?.diagramNumber || primaryApi?.diagramNumber),
      originalPartNumber: original,
      currentServicePartNumber: current,
      description: chooseDescription(baseRow.description, primarySears?.description, primaryApi?.description, priceEvidence?.description),
      nlaStatus: typeof baseRow.nlaStatus === "boolean" ? baseRow.nlaStatus : null,
      availability: primarySears?.availability || primaryApi?.availability || null,
      searsPrice,
      encompassPrice,
      selectedRetailPrice: searsPrice ?? encompassPrice ?? null,
      selectedRetailPriceSource: searsPrice !== null
        ? "searspartsdirect.com"
        : encompassPrice !== null
          ? "encompass_price_comparison"
          : null,
      sources: [
        baseRow.source,
        matchedSears.length ? "sears_partsdirect_screenshot_json" : null,
        matchedApi.length ? "sears_catalog_api_capture" : null,
        priceEvidence ? "operator_price_comparison_csv" : null,
      ].filter(Boolean).filter((value, index, self) => self.indexOf(value) === index),
      sourceUrls: [
        baseRow.sourceUrl,
        primarySears?.sourceUrl,
        matchedApi.length ? SEARS_MODEL_URL : null,
      ].filter(Boolean).filter((value, index, self) => self.indexOf(value) === index),
      evidence: {
        completeBomRow: origin === "complete_bom_csv" ? baseRow.rowId : null,
        searsRows: matchedSears.map((row) => row.rowId).filter((value) => value !== null),
        searsApiFirstPage: matchedApi.length > 0,
        priceComparison: priceEvidence ? priceEvidence.partNumber : null,
      },
      reviewFlags: flags,
    };
  }

  for (const row of completeRows) {
    byRowKey.set(rowKey(row), buildMerged(row, "complete_bom_csv"));
  }

  const completeOriginalParts = new Set(completeRows.map(partNumberKey));
  const completeCurrentParts = new Set(completeRows.map(currentPartNumberKey));

  for (const row of searsRows) {
    if (row.reviewFlag) continue;
    if (
      completeOriginalParts.has(partNumberKey(row)) ||
      completeCurrentParts.has(currentPartNumberKey(row))
    ) {
      continue;
    }

    const key = rowKey(row);
    if (!byRowKey.has(key)) byRowKey.set(key, buildMerged(row, "sears_only"));
  }

  return Array.from(byRowKey.values()).sort((a, b) => {
    const sectionCompare = a.section.localeCompare(b.section);
    if (sectionCompare) return sectionCompare;
    const aNum = Number(a.diagramNumber);
    const bNum = Number(b.diagramNumber);
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
    return a.originalPartNumber.localeCompare(b.originalPartNumber);
  });
}

function countUnique(rows, selector) {
  return new Set(rows.map(selector).map(upper).filter(Boolean)).size;
}

function summarize(parts, sourceRows) {
  const sectionCounts = parts.reduce((acc, row) => {
    acc[row.section] = (acc[row.section] || 0) + 1;
    return acc;
  }, {});

  return {
    modelNumber: MODEL_NUMBER,
    counts: {
      operatorMentionedTarget: 89,
      searsCatalogApiExpectedTotal: sourceRows.searsCatalog.model?.expectedPartsTotal ?? null,
      completeBomCsvRows: sourceRows.completeRows.length,
      completeBomCsvUniqueOriginalPartNumbers: countUnique(sourceRows.completeRows, (row) => row.originalPartNumber),
      searsRenderedRows: sourceRows.searsRows.length,
      searsRenderedUniqueOriginalPartNumbers: countUnique(sourceRows.searsRows, (row) => row.originalPartNumber),
      searsRenderedDuplicateFlaggedRows: sourceRows.searsRows.filter((row) => row.reviewFlag).length,
      consolidatedRows: parts.length,
      consolidatedUniqueOriginalPartNumbers: countUnique(parts, (row) => row.originalPartNumber),
      consolidatedUniqueCurrentServicePartNumbers: countUnique(parts, (row) => row.currentServicePartNumber),
      rowsWithSearsPrice: parts.filter((row) => row.searsPrice !== null).length,
      rowsWithEncompassPrice: parts.filter((row) => row.encompassPrice !== null).length,
      rowsMissingRenderedSearsEvidence: parts.filter((row) => row.reviewFlags.includes("missing_from_sears_rendered_rows")).length,
      rowsNotInCompleteBomCsv: parts.filter((row) => row.reviewFlags.includes("not_in_complete_bom_csv")).length,
    },
    taxonomy: {
      sectionCounts,
      normalizedSections: Object.keys(sectionCounts).sort(),
    },
    sources: {
      completeBomCsv: INPUTS.completeBomCsv,
      searsScreenshotJson: INPUTS.searsScreenshotJson,
      searsCatalogCapture: INPUTS.searsCatalogCapture,
      priceComparisonText: INPUTS.priceComparisonText,
      geModelUrlAssumption: GE_MODEL_URL,
      searsModelUrl: SEARS_MODEL_URL,
    },
    reviewNotes: [
      "Counts disagree across evidence: operator mentioned 89, Sears API reports 90, and complete BOM CSV contains 94 diagram rows.",
      "Rows are merged by section + diagram number + original part number so distinct left/right or repeated diagram parts are not collapsed by shared current service part.",
      "Sears API capture proves the model identity and expected total, but only includes first-page part rows in the captured payload.",
      "No database writes are performed by this consolidation script.",
    ],
  };
}

function toCsv(rows) {
  const headers = [
    "section",
    "diagramNumber",
    "originalPartNumber",
    "currentServicePartNumber",
    "description",
    "nlaStatus",
    "availability",
    "searsPrice",
    "encompassPrice",
    "selectedRetailPrice",
    "selectedRetailPriceSource",
    "sources",
    "reviewFlags",
    "sourceUrls",
  ];

  function escapeCsv(value) {
    if (value === null || value === undefined) return "";
    const s = Array.isArray(value) ? value.join("; ") : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
}

function main() {
  const completeRows = loadCompleteBomRows(INPUTS.completeBomCsv);
  const searsRows = loadSearsRows(INPUTS.searsScreenshotJson);
  const searsCatalog = parseSearsCatalogCapture(INPUTS.searsCatalogCapture);
  const priceRows = loadPriceComparisonRows(INPUTS.priceComparisonText);
  const parts = mergeSources({
    completeRows,
    searsRows,
    apiRows: searsCatalog.firstPageParts,
    priceRows,
  });
  const summary = summarize(parts, { completeRows, searsRows, searsCatalog, priceRows });
  const output = {
    generatedAt: new Date().toISOString(),
    summary,
    parts,
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${OUTPUT_STEM}.json`);
  const csvPath = path.join(outputDir, `${OUTPUT_STEM}.csv`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(csvPath, `${toCsv(parts)}\n`);

  console.log(JSON.stringify({
    jsonPath,
    csvPath,
    counts: summary.counts,
  }, null, 2));
}

main();
