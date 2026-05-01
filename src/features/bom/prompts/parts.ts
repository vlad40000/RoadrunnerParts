import { EXECUTION_CONTRACT } from './contract';

export const partsExtractionPrompt = `
${EXECUTION_CONTRACT}
You are completing exactly one bounded extraction task.
You are not managing a workflow.
You are not writing prompts.
You are not simulating tools.
You are not querying databases.
You are not fetching sources.
You are not continuing prior context.
You are not using memory.
Return only the requested JSON object.

TASK:
Extract verified appliance BOM rows from the provided exact-model source text.

INPUT:
{
  "targetModel": "[MODEL]",
  "provider": "[PROVIDER]",
  "sourceUrl": "[SOURCE URL]",
  "sourceType": "[manufacturer|distributor|manual|diagram|unknown]",
  "sectionName": "[SECTION OR null]",
  "text": "[SOURCE TEXT]"
}

PREVIOUS PASS PART NUMBERS:
[INSERT ARRAY OF PART NUMBERS ALREADY USED OR []]

PART COUNT CONTRACT:
Determine source_total_part_count early if visible.
Do not claim source_total_part_count unless explicitly visible in the source.
This pass must attempt to return at least 40 verified, non-duplicate part rows.
If fewer than 40 rows are returned, source_exhausted must be true or shortfall_reason must be provided.
Do not repeat part numbers from PREVIOUS PASS PART NUMBERS.
Do not invent rows to reach 40.
Do not include pricing in this agent.
Do not include generic family-only parts unless the exact target model is confirmed.

EXTRACTION RULES:
Extract only from provided source text.
Do not search.
Do not fetch.
Do not add parts from memory.
Do not infer compatibility.
Do not invent part numbers.
Preserve original part numbers exactly as shown.
Preserve section labels exactly as shown.
If a replacement/service part is stated, preserve both original and current service part numbers.
Reject wrong-model, wrong-fuel, wrong-appliance, malformed, duplicate, and weak-evidence rows.

OUTPUT JSON:
{
  "agent": "parts_bom",
  "model": "[MODEL]",
  "provider": "[PROVIDER]",
  "sourceUrl": "[SOURCE URL]",
  "source_total_part_count": null,
  "source_total_part_count_evidence": null,
  "target_rows_this_pass": 40,
  "actual_rows_this_pass": 0,
  "source_exhausted": false,
  "shortfall_reason": null,
  "sections_found": [],
  "rows": [],
  "rejected_rows": [],
  "duplicate_part_numbers_skipped": [],
  "manual_review_flags": []
}
`.trim();

/**
 * STEP 10 — Grounded Synthesis
 * Task: Synthesize missing BOM rows based on context and diagrams.
 */
export function buildGroundedSynthesisPrompt(input: {
  model: string;
  applianceType?: string | null;
  fuelType?: string | null;
}) {
  return `
${EXECUTION_CONTRACT}

TASK:
Synthesize verified Bill of Materials (BOM) part rows for the provided appliance model.

CONTEXT:
Model: ${input.model}
Appliance Type: ${input.applianceType || "unknown"}
Fuel Type: ${input.fuelType || "unknown"}

OUTPUT JSON:
{
  "rows": [
    {
      "section": "Standardized section name",
      "sectionOriginal": "Source section name if applicable",
      "diagramNumber": "Callout number",
      "originalPartNumber": "Part number",
      "currentServicePartNumber": "Current part number",
      "description": "Description",
      "nlaStatus": false,
      "replacementNote": null,
      "confidence": 0.0-1.0
    }
  ],
  "summary": "Brief explanation of synthesis approach",
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 4 — BOM + Pricing
 * Task: Extract BOM rows with pricing information from provided source text.
 */
export function buildPricingExtractionPrompt(input: {
  model: string;
  applianceType?: string | null;
  fuelType?: string | null;
}) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured Bill of Materials (BOM) part rows INCLUDING pricing, availability, and TOTAL PART COUNT information from the provided source evidence.

CONTEXT:
Model: ${input.model}
Appliance Type: ${input.applianceType || "unknown"}
Fuel Type: ${input.fuelType || "unknown"}

OUTPUT JSON:
{
  "rows": [
    {
      "section": "Standardized section name (e.g. 'Cabinet & Frame')",
      "sectionOriginal": "Exact section name from source",
      "diagramNumber": "Callout or diagram index",
      "originalPartNumber": "Part number as listed",
      "currentServicePartNumber": "Substitution part number if listed",
      "description": "Full part description",
      "nlaStatus": true/false (if discontinued),
      "replacementNote": "Any specific fitment or replacement notes",
      "retailPrice": 0.00 (numeric price if available),
      "retailPriceText": "$0.00 (formatted price string)",
      "retailAvailability": "In Stock / Out of Stock / NLA",
      "confidence": 0.0-1.0
    }
  ],
  "expectedPartCount": number | null (Look for 'Showing 1-20 of 145' or '145 items found'),
  "expectedPartCountEvidence": "string" (Exact text from source used to determine count),
  "paginationComplete": true/false (true if all parts for the model are present in this text),
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 3.1 — Fix.com Exact-Model Extractor
 */
export function buildFixComExtractorPrompt(input: { model: string }) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured BOM part rows from Fix.com for the exact model: ${input.model}.

OUTPUT JSON:
{
  "rows": [...],
  "expectedPartCount": number | null,
  "expectedPartCountEvidence": "string",
  "paginationComplete": boolean,
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 3.2 — SearsPartsDirect Exact-Model Extractor
 */
export function buildSearsExtractorPrompt(input: { model: string }) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured BOM part rows from SearsPartsDirect for the exact model: ${input.model}.

OUTPUT JSON:
{
  "rows": [...],
  "expectedPartCount": number | null,
  "expectedPartCountEvidence": "string",
  "paginationComplete": boolean,
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 3.3 — Encompass Extractor
 */
export function buildEncompassExtractorPrompt(input: { model: string }) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured BOM part rows from Encompass for the model: ${input.model}.

OUTPUT JSON:
{
  "rows": [...],
  "expectedPartCount": number | null,
  "expectedPartCountEvidence": "string",
  "paginationComplete": boolean,
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 3.4 — OEM/Manual Extractor
 */
export function buildManualExtractorPrompt(input: { model: string }) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured BOM part rows from an OEM Manual or Parts List for model: ${input.model}.

OUTPUT JSON:
{
  "rows": [...],
  "expectedPartCount": number | null,
  "expectedPartCountEvidence": "string",
  "paginationComplete": boolean,
  "manual_review_flags": []
}
`.trim();
}

/**
 * AGENT 3.5 — Uploaded Diagram/Manual Extractor
 */
export function buildDiagramExtractorPrompt(input: { model: string }) {
  return `
${EXECUTION_CONTRACT}

TASK:
Extract structured BOM part rows from an uploaded diagram or manual page for model: ${input.model}.

OUTPUT JSON:
{
  "rows": [...],
  "expectedPartCount": number | null,
  "expectedPartCountEvidence": "string",
  "paginationComplete": boolean,
  "manual_review_flags": []
}
`.trim();
}

