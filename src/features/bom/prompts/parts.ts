import {
  REMARK_TRUTH_COUNT,
  REMARK_RETAIL_ONLY,
  REMARK_DETERMINISTIC,
} from './contract';

function partsExtractionStagePrompt(input?: {
  sectionName?: string;
}) {
  return `
<task>Extract part rows from diagram section: ${input?.sectionName ?? "[SECTION]"}.</task>

<output_contract>
Return JSON only:
{
  "rows": [
    { "section": "string", "diagramNumber": "string", "originalPartNumber": "string", "description": "string", "nlaStatus": boolean }
  ]
}
</output_contract>
`.trim();
}

export const partsExtractionPrompt = partsExtractionStagePrompt();

export function buildGroundedSynthesisPrompt(input: {
  model: string;
  applianceType?: string | null;
  fuelType?: string | null;
}) {
  return `
Reminder: ${REMARK_TRUTH_COUNT}
<task>Map extracted parts to manifest for model: ${input.model}${input.applianceType ? ` (${input.applianceType})` : ""}.</task>

<output_contract>
Return JSON only:
{ "status": "string", "mappedExactCount": number, "unmappedRequiredCount": number, "partsComplete": boolean }
</output_contract>
`.trim();
}

export function buildPricingExtractionPrompt(input: {
  model: string;
  applianceType?: string | null;
  fuelType?: string | null;
}) {
  return `
Reminder: ${REMARK_RETAIL_ONLY}
<task>Find exact source-listed retail pricing for parts in model: ${input.model}${input.applianceType ? ` (${input.applianceType})` : ""}.</task>

<output_contract>
Return JSON only:
{ "enrichments": [{ "partNumber": "string", "price": number | null, "priceSource": "string" }] }
</output_contract>
`.trim();
}

export function buildFallbackPricingPrompt(input: { partNumber: string }) {
  return `
Reminder: ${REMARK_RETAIL_ONLY}
<task>Find verified fallback retail price for part: ${input.partNumber}.</task>

<output_contract>
Return JSON only: { "status": "string", "retailPrice": number | null, "selectedSource": "string" }
</output_contract>
`.trim();
}

export function buildFixComExtractorPrompt(input: { model: string }) {
  return partsExtractionStagePrompt({ sectionName: "fix.com section" });
}

export function buildSearsExtractorPrompt(input: { model: string }) {
  return partsExtractionStagePrompt({ sectionName: "sears section" });
}

export function buildEncompassExtractorPrompt(input: { model: string }) {
  return partsExtractionStagePrompt({ sectionName: "encompass section" });
}

export function buildManualExtractorPrompt(input: { model: string }) {
  return partsExtractionStagePrompt({ sectionName: "manual entry" });
}

export function buildDiagramExtractorPrompt(input: { model: string }) {
  return partsExtractionStagePrompt({ sectionName: "diagram section" });
}
