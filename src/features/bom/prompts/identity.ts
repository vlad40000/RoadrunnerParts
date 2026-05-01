export const IDENTITY_EXTRACTION_PROMPT = `
Preserve exact model suffixes, dashes, slashes, and orientation-normalized text.
Extract ONLY visible appliance model and serial number from nameplate image evidence.

RULES:
- Return null for unreadable fields.
- Do not infer missing digits.
- Do not guess based on styling.
- Do not search the web.
- Preserve exact model/serial suffixes, dashes, slashes, spaces, and capitalization when visible.
- Return JSON only.

TASK:
Extract the model and serial number from the nameplate image evidence.

JSON_SHAPE:
{
  "status": "complete | partial | failed",
  "candidate_identity": {
    "model": "string | null",
    "serial": "string | null"
  },
  "confidence": {
    "model": 0.0,
    "serial": 0.0
  }
}

STATUS_RULES:
- complete = both model and serial are readable.
- partial = either model or serial is readable.
- failed = neither model nor serial could be read.
`;
