import type {
  NormalizedModelOutput,
  PromptScenarioType,
  PromptValidationResult,
  RetrievalStatus,
} from "./types";

const RETRIEVAL_STATUSES: RetrievalStatus[] = [
  "no_result",
  "summary_only",
  "needs_fallback",
  "parts_partial",
  "bom_complete",
  "failed",
];

function stripJsonFence(text: string) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = stripJsonFence(value);
  if (!trimmed) return null;
  try {
    return parseJsonValue(JSON.parse(trimmed));
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function partNumberOf(row: Record<string, unknown>) {
  return text(row.partNumber || row.part_number || row.currentServicePartNumber || row.oemNumber || row.oem_number).toUpperCase();
}

function partTitleOf(row: Record<string, unknown>) {
  return text(row.partTitle || row.part_title || row.description || row.title || row.name);
}

function sourceUrlOf(row: Record<string, unknown>) {
  return text(row.sourceUrl || row.source_url || row.source);
}

function confidenceOf(row: Record<string, unknown>) {
  const value = row.confidence;
  const parsed = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function rawTextOf(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : JSON.stringify(value ?? "", null, 2).trim();
}

function validateCsvOutput(rawOutput: unknown) {
  const rawText = rawTextOf(rawOutput);
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!lines.length) errors.push("CSV output is empty.");
  if (lines[0] !== "Sheet_Title,Callout_Number") {
    errors.push("CSV header must be exactly Sheet_Title,Callout_Number.");
  }
  if (lines.length < 2) warnings.push("CSV returned no callout rows.");

  for (const line of lines.slice(1)) {
    const columns = line.split(",");
    if (columns.length !== 2) {
      errors.push(`CSV row must have exactly 2 columns: ${line}`);
      continue;
    }
    if (!columns[0].trim()) errors.push(`CSV row is missing Sheet_Title: ${line}`);
    if (!/^\d+$/.test(columns[1].trim())) {
      errors.push(`Callout_Number must be numeric digits only: ${line}`);
    }
  }

  return { errors, warnings };
}

function validateUrlOutput(rawOutput: unknown) {
  const rawText = rawTextOf(rawOutput);
  const errors: string[] = [];

  if (!/^https?:\/\/\S+$/i.test(rawText)) {
    errors.push("Output must be exactly one absolute URL.");
  }
  if (/\s/.test(rawText)) {
    errors.push("URL output must not include whitespace or explanations.");
  }

  return { errors, warnings: [] as string[] };
}

function validateComputerUseOutput(rawOutput: unknown) {
  const rawText = rawTextOf(rawOutput);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (/^BLOCKED:\s+\S/i.test(rawText)) {
    return { errors, warnings };
  }

  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 3) {
    errors.push("Successful output must contain exactly three numbered items.");
  }

  lines.forEach((line, index) => {
    if (!new RegExp(`^${index + 1}\\.\\s+\\S`).test(line)) {
      errors.push(`Line ${index + 1} must start with "${index + 1}. ".`);
    }
  });

  return { errors, warnings };
}

export function normalizeModelOutput(rawOutput: unknown): NormalizedModelOutput {
  const rawText =
    typeof rawOutput === "string"
      ? rawOutput
      : JSON.stringify(rawOutput ?? "", null, 2);
  const parsedJson = parseJsonValue(rawOutput);
  const parsedRecord = asRecord(parsedJson);
  const isParsed = parsedJson !== rawOutput || typeof rawOutput !== "string";
  const parseError =
    typeof rawOutput === "string" && !isParsed
      ? "Output is not valid JSON yet."
      : null;

  return {
    rawText,
    parsedJson: isParsed ? parsedJson : null,
    parseError,
    jsonKeys: Object.keys(parsedRecord),
  };
}

export function validatePromptOutput(input: {
  scenarioType: PromptScenarioType;
  rawOutput?: unknown;
  parsedJson?: unknown;
}): PromptValidationResult {
  if (input.scenarioType === "technical_diagram_callouts_csv") {
    const { errors, warnings } = validateCsvOutput(input.rawOutput ?? "");
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      acceptedRows: [],
      rejectedRows: [],
      completenessStatus: "unknown",
    };
  }

  if (input.scenarioType === "official_parts_source_search") {
    const { errors, warnings } = validateUrlOutput(input.rawOutput ?? "");
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      acceptedRows: [],
      rejectedRows: [],
      completenessStatus: "unknown",
    };
  }

  if (input.scenarioType === "computer_use_navigation") {
    const { errors, warnings } = validateComputerUseOutput(input.rawOutput ?? "");
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      acceptedRows: [],
      rejectedRows: [],
      completenessStatus: "unknown",
    };
  }

  const normalized =
    input.parsedJson !== undefined
      ? {
          rawText: typeof input.rawOutput === "string" ? input.rawOutput : "",
          parsedJson: parseJsonValue(input.parsedJson),
          parseError: null,
          jsonKeys: Object.keys(asRecord(input.parsedJson)),
        }
      : normalizeModelOutput(input.rawOutput ?? "");

  const errors: string[] = [];
  const warnings: string[] = [];
  let acceptedRows: Array<Record<string, unknown>> = [];
  let rejectedRows: Array<{ row: Record<string, unknown>; reason: string }> = [];
  let completenessStatus: PromptValidationResult["completenessStatus"] = "unknown";

  if (!normalized.parsedJson) {
    return {
      valid: false,
      errors: [normalized.parseError || "Missing parsed JSON output."],
      warnings,
      acceptedRows,
      rejectedRows,
      completenessStatus,
    };
  }

  const root = asRecord(normalized.parsedJson);

  if (
    input.scenarioType === "identity_extraction" ||
    input.scenarioType === "nameplate_ocr_identity_json" ||
    input.scenarioType === "plaintext_identity_extraction"
  ) {
    if (!("brand" in root)) warnings.push("brand field is missing.");
    if (input.scenarioType === "plaintext_identity_extraction") {
      if (!("model" in root)) warnings.push("model field is missing.");
      if (!Array.isArray(root.voltage_or_power_clues)) {
        errors.push("voltage_or_power_clues must be an array.");
      }
    } else if (!("modelNumber" in root)) {
      warnings.push("modelNumber field is missing.");
    }
  }

  if (
    input.scenarioType === "bom_extraction" ||
    input.scenarioType === "bom_row_extraction_json" ||
    input.scenarioType === "bom_validation"
  ) {
    const parts = asRows(root.parts || root.rows || root.acceptedRows || root.bom_rows);
    const seen = new Map<string, number>();
    const status = text(asRecord(root.completeness).status || root.retrievalStatus || root.status);
    if (RETRIEVAL_STATUSES.includes(status as RetrievalStatus)) {
      completenessStatus = status as RetrievalStatus;
    }

    for (const row of parts) {
      const partNumber = partNumberOf(row) || text(row.part_number).toUpperCase();
      const partTitle = partTitleOf(row);
      const sourceUrl = sourceUrlOf(row);
      const confidence = confidenceOf(row);
      const duplicateKey = `${partNumber}|${text(row.assemblySection || row.section || row.diagramKey)}`;

      if (!partNumber && input.scenarioType !== "bom_row_extraction_json") {
        rejectedRows.push({ row, reason: "Missing part number." });
        continue;
      }
      if (!partTitle) {
        rejectedRows.push({ row, reason: "Missing part title." });
        continue;
      }
      if (!sourceUrl && input.scenarioType !== "bom_row_extraction_json") {
        rejectedRows.push({ row, reason: "Missing source URL." });
        continue;
      }
      if (confidence !== null && confidence < 0.4) {
        rejectedRows.push({ row, reason: "Confidence is below threshold." });
        continue;
      }
      if (seen.has(duplicateKey)) {
        warnings.push(`Duplicate part number in same section: ${partNumber}`);
      }
      seen.set(duplicateKey, (seen.get(duplicateKey) || 0) + 1);
      acceptedRows.push(row);
    }

    if (status === "no_result") {
      errors.push("Retrieval status is no_result.");
    }
    if (!parts.length && (input.scenarioType === "bom_extraction" || input.scenarioType === "bom_row_extraction_json")) {
      warnings.push("No part rows were returned.");
    }
  }

  if (input.scenarioType === "pricing_reconciliation") {
    if (!text(root.partNumber)) errors.push("partNumber is required.");
    if (!text(root.supplier)) errors.push("supplier is required.");
    if (!text(root.sourceUrl)) errors.push("sourceUrl is required for pricing evidence.");
    if (root.price === null || root.price === undefined || root.price === "") {
      warnings.push("No price was supplied.");
    }
  }

  if (input.scenarioType === "pricing_router") {
    if (!("selected_tier" in root) && !("tier" in root)) warnings.push("selected_tier field is missing.");
    if (!text(root.reason)) warnings.push("reason field is missing.");
  }

  if (input.scenarioType === "retail_pricing_verification") {
    if (!text(root.part_number)) errors.push("part_number is required.");
    if (!Array.isArray(root.verified_prices)) errors.push("verified_prices must be an array.");
  }

  if (input.scenarioType === "visual_qa_drift_json") {
    if (typeof root.passed !== "boolean") errors.push("passed must be boolean.");
    if (typeof root.major_drift_detected !== "boolean") errors.push("major_drift_detected must be boolean.");
  }

  if (input.scenarioType === "ebay_listing_prep") {
    if (root.readyForReview === true) {
      const draft = asRecord(root.listingDraft);
      if (!text(draft.title)) errors.push("Ready listing is missing a title.");
      if (!text(draft.sku)) errors.push("Ready listing is missing a SKU.");
      if (!Array.isArray(draft.photoIds) || draft.photoIds.length === 0) {
        errors.push("Ready listing is missing photo IDs.");
      }
    }
  }

  return {
    valid: errors.length === 0 && rejectedRows.length === 0,
    errors,
    warnings,
    acceptedRows,
    rejectedRows,
    completenessStatus,
  };
}
