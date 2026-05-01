export const identityExtractionPrompt = `
- Extract ONLY visible identity (brand, model, serial) from nameplate image evidence.
- Return null for unreadable fields; do not infer missing digits or search web.
- Preserve exact model suffixes, dashes, slashes, and orientation-normalized text.

TASK: Extract the appliance identity fields from the nameplate image evidence and return them in the specified JSON shape.

JSON_SHAPE:
{
  "status": "complete | partial | failed",
  "candidate_identity": {
    "brand": "string | null",
    "model": "string | null",
    "serial": "string | null",
    "type_code": "string | null",
    "product_type": "string | null",
    "appliance_type": "string | null",
    "fuel_type": "electric | gas | other | null",
    "voltage_or_power_clues": ["string"],
    "wire_connection": "string | null"
  },
  "confidence": {
    "brand": 0.0,
    "model": 0.0,
    "serial": 0.0
  },
  "evidence_used": ["string"]
}
`.trim();

export const identityNormalizationPrompt = `
- Normalize OCR output into canonical brand family, model, and appliance type.
- Preserve exact model string; do not strip rev numbers, trailing zeros, or variants.
- Return failed if brand family or model cannot be resolved from the provided evidence.

TASK: Normalize the extracted nameplate data into canonical brand family and model records and return them in the specified JSON shape.

JSON_SHAPE:
{
  "brand": "string | null",
  "resolved_oem_brand": "string | null",
  "manufacturer_family": "string | null",
  "model": "string | null",
  "serial": "string | null",
  "type_code": "string | null",
  "appliance_type": "string | null",
  "fuel_type": "electric | gas | other | null",
  "normalization_status": "complete | partial | failed",
  "evidence": ["string"],
  "blockers": ["string"]
}
`.trim();

