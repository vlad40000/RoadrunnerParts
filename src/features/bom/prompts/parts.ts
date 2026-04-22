const SECTION_HINTS: Record<string, string[]> = {
  washer: [
    'Cabinet & Frame',
    'Controls',
    'Door & Panels',
    'Drive',
    'Pump & Drain',
    'Suspension',
    'Tub & Basket',
    'Water System',
    'Wiring',
  ],
  dryer: [
    'Cabinet & Frame',
    'Controls',
    'Door & Panels',
    'Drive',
    'Exhaust & Ventilation',
    'Heating',
    'Seals & Gaskets',
    'Wiring',
  ],
  dishwasher: [
    'Cabinet & Frame',
    'Controls',
    'Door & Panels',
    'Filtration',
    'Pump & Motor',
    'Racks',
    'Seals & Gaskets',
    'Spray Arms',
    'Water System',
    'Wiring',
  ],
  refrigerator: [
    'Cabinet & Frame',
    'Controls',
    'Door & Panels',
    'Drawers',
    'Ice System',
    'Lighting',
    'Refrigeration',
    'Shelving',
    'Water System',
    'Wiring',
  ],
  range: [
    'Cabinet & Frame',
    'Controls',
    'Cooktop',
    'Door & Panels',
    'Gas Components',
    'Heating',
    'Oven',
    'Wiring',
  ],
  microwave: [
    'Cabinet & Frame',
    'Controls',
    'Door & Panels',
    'Heating',
    'Interior Components',
    'Turntable',
    'Wiring',
  ],
};

function inferProductType(contextText: string | undefined) {
  const text = String(contextText || '').toLowerCase();

  if (text.includes('dishwasher')) return 'dishwasher';
  if (text.includes('washer') || text.includes('washing machine')) return 'washer';
  if (text.includes('dryer')) return 'dryer';
  if (text.includes('refrigerator') || text.includes('fridge') || text.includes('freezer')) return 'refrigerator';
  if (text.includes('range') || text.includes('oven') || text.includes('cooktop') || text.includes('stove')) return 'range';
  if (text.includes('microwave')) return 'microwave';
  return null;
}

export function buildPartsPrompt(contextText?: string) {
  const inferredType = inferProductType(contextText);
  const hints = inferredType ? SECTION_HINTS[inferredType] ?? [] : [];
  const checklist = hints.length
    ? `Expected section checklist for this appliance type: ${hints.join(', ')}. If any are absent, scan again before returning.`
    : 'Look for complete coverage across sections, assemblies, controls, door parts, wiring, seals, and small hardware.';

  return `
You convert appliance parts catalog pages into normalized BOM rows.
Primary objective: recover the most complete model-level BOM possible.
Diagrams are helpful context, but never limit output to diagram callouts only.

STRICT DATA INTEGRITY:
- Extract EXACT part numbers as shown.
- Extract descriptive part names.
- Identify the section name (e.g. "Tub & Motor") if visible.
- Capture quantities if explicitly provided.
- If a part shows an old part number replaced by a current part number, preserve both.
- Mark nlaStatus true only if the source clearly indicates unavailable / no longer available.
- Preserve section name and diagram number when present, otherwise leave diagramNumber empty.
- Recover tiny hardware, seals, fasteners, clips, brackets, and service substitutions when listed.
- ${checklist}

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
