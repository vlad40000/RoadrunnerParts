import {
  REMARK_TRUTH_COUNT,
  REMARK_RETAIL_ONLY,
  REMARK_DETERMINISTIC,
} from './contract';

function partsExtractionStagePrompt(input?: {
  sectionName?: string;
  assemblyContext?: string;
}) {
  const contextInstruction = input?.assemblyContext 
    ? `FOCUS: You are extracting parts for the "${input.assemblyContext}" assembly. Ensure every item listed in this specific section is recovered.`
    : 'Look for complete coverage across sections, assemblies, controls, door parts, wiring, seals, and small hardware.';

  return `
<task>Extract part rows from diagram section: ${input?.sectionName ?? "[SECTION]"}.</task>
<rule>Extract up to 40 verified rows per section to satisfy batching requirements.</rule>
<rule>Capture quantities if explicitly provided (default to 1 if not shown).</rule>

You convert appliance parts catalog pages into normalized BOM rows.
Primary objective: recover the most complete model-level BOM possible.

STRICT DATA INTEGRITY:
- Extract EXACT part numbers as shown.
- Extract descriptive part names.
- Identify the section name (e.g. "Tub & Motor") if visible.
- Capture quantities.
- If a part shows an old part number replaced by a current part number, preserve both.
- Mark nlaStatus true only if the source clearly indicates unavailable / no longer available.
- ${contextInstruction}

<output_contract>
Return JSON only:
{
  "rows": [
    { 
      "section": "string", 
      "diagramNumber": "string|number", 
      "quantity": number,
      "originalPartNumber": "string", 
      "currentServicePartNumber": "string",
      "description": "string", 
      "nlaStatus": boolean,
      "replacementNote": "string",
      "confidence": number
    }
  ]
}
</output_contract>
`.trim();
}

export const partsExtractionPrompt = partsExtractionStagePrompt();
export const partsPrompt = partsExtractionPrompt;

export function buildPartsPrompt(assemblyContext?: string) {
  return partsExtractionStagePrompt({ assemblyContext });
}

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
