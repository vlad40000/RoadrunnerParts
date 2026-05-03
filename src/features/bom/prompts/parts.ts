import {
  REMARK_TRUTH_COUNT,
  REMARK_RETAIL_ONLY,
  REMARK_DETERMINISTIC,
} from './contract';

function partsExtractionStagePrompt(input?: {
  sectionName?: string;
  assemblyContext?: string;
  sourceUrl?: string;
  visualTruth?: {
    screenshotBase64?: string | null;
    canonUrl?: string | null;
    expectedTotal?: number | null;
    assemblyNames?: string[];
  } | null;
}) {
  const contextInstruction = input?.assemblyContext 
    ? `FOCUS: You are extracting parts for the "${input.assemblyContext}" assembly. Ensure every item listed in this specific section is recovered.`
    : 'Look for complete coverage across sections, assemblies, controls, door parts, wiring, seals, and small hardware.';

  const truthBlock = input?.visualTruth ? `
ENCOMPASS VISUAL TRUTH CONTEXT

Target Supplier URL:
${input.sourceUrl || "Not Provided"}

Encompass Canon URL:
${input.visualTruth.canonUrl || "Not Provided"}

Encompass Overview Screenshot:
${input.visualTruth.screenshotBase64 ? "PROVIDED (ATTACHED)" : "Not Provided"}

Expected Total:
${input.visualTruth.expectedTotal || "Not Provided"}

Canonical Assembly Names:
${input.visualTruth.assemblyNames?.join(", ") || "Not Provided"}

Rules:
- Extract rows only from the Target Supplier URL.
- Use the Encompass Canon URL and Overview Screenshot as visual/assembly context.
- Map supplier section names onto the canonical Encompass assembly names.
- If a supplier row cannot be mapped to the Encompass visual/assembly context, return it as potential_mismatch.
- Expected Total is a coverage target, not permission to invent rows.
- Do not invent part numbers from unreadable callouts.
- Do not treat Encompass as the row source unless this is the Encompass agent.
- Return schema-valid JSON only.
` : "";

  return `
${truthBlock}
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

export function buildPartsPrompt(input?: {
  assemblyContext?: string;
  sourceUrl?: string;
  visualTruth?: any;
}) {
  return partsExtractionStagePrompt({ 
    assemblyContext: input?.assemblyContext,
    sourceUrl: input?.sourceUrl,
    visualTruth: input?.visualTruth
  });
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

export function buildFixComExtractorPrompt(input: { model: string; sourceUrl?: string; visualTruth?: any }) {
  return partsExtractionStagePrompt({ sectionName: "fix.com section", sourceUrl: input.sourceUrl, visualTruth: input.visualTruth });
}

export function buildSearsExtractorPrompt(input: { model: string; sourceUrl?: string; visualTruth?: any }) {
  return partsExtractionStagePrompt({ sectionName: "sears section", sourceUrl: input.sourceUrl, visualTruth: input.visualTruth });
}

export function buildEncompassExtractorPrompt(input: { model: string; sourceUrl?: string; visualTruth?: any }) {
  return partsExtractionStagePrompt({ sectionName: "encompass section", sourceUrl: input.sourceUrl, visualTruth: input.visualTruth });
}

export function buildManualExtractorPrompt(input: { model: string; sourceUrl?: string; visualTruth?: any }) {
  return partsExtractionStagePrompt({ sectionName: "manual entry", sourceUrl: input.sourceUrl, visualTruth: input.visualTruth });
}

export function buildDiagramExtractorPrompt(input: { model: string; sourceUrl?: string; visualTruth?: any }) {
  return partsExtractionStagePrompt({ sectionName: "diagram section", sourceUrl: input.sourceUrl, visualTruth: input.visualTruth });
}
