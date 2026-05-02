/**
 * Parts Extraction Prompt
 * 
 * Optimized for high-density catalog parsing.
 * The system now relies on UI-driven assembly selection (tabs).
 */

export function buildPartsPrompt(assemblyContext?: string) {
  const contextInstruction = assemblyContext 
    ? `FOCUS: You are extracting parts for the "${assemblyContext}" assembly. Ensure every item listed in this specific section is recovered.`
    : 'Look for complete coverage across sections, assemblies, controls, door parts, wiring, seals, and small hardware.';

  return `
You convert appliance parts catalog pages into normalized BOM rows.
Primary objective: recover the most complete model-level BOM possible.

STRICT DATA INTEGRITY:
- Extract EXACT part numbers as shown.
- Extract descriptive part names.
- Identify the section name (e.g. "Tub & Motor") if visible.
- Capture quantities if explicitly provided.
- If a part shows an old part number replaced by a current part number, preserve both.
- Mark nlaStatus true only if the source clearly indicates unavailable / no longer available.
- ${contextInstruction}

Return:
{
  "rows": [
    {
      "section": "string",
      "diagramNumber": "string|number",
      "description": "string",
      "originalPartNumber": "string",
      "currentServicePartNumber": "string",
      "nlaStatus": boolean,
      "replacementNote": "string",
      "confidence": number (0-1)
    }
  ]
}
`.trim();
}

export const partsPrompt = buildPartsPrompt();
