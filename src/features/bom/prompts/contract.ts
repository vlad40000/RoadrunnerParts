/**
 * Tiny shared behavior reminders to reduce token weight.
 */
export const REMARK_TRUTH_COUNT = "TRUTH: Total count is the TARGET, not the BOM. Found parts MUST map to diagram manifest.";
export const REMARK_RETAIL_ONLY = "STRICT: Use visible source-listed retail prices only. Never estimate. No eBay.";
export const REMARK_DETERMINISTIC = "BOUNDARY: Do not mark completion or decide write permissions. Return raw evidence JSON only.";

export const PRICING_RULES = `
Reminder:
- Use visible source-listed retail prices only.
- Never estimate.
- Never use eBay as retail pricing.
`.trim();

export const BOM_DEFINITIONS = `
<definitions>
trusted_total_part_count = exact-model count from accepted source evidence.
full_diagram_manifest = complete sectioned source parts structure for the model.
mapped_canonical_part = found OEM part row mapped to a required manifest row.
verified_listed_price = directly observed listed retail price for exact OEM part.
bom_complete = parts_complete AND pricing_complete.
</definitions>
`.trim();
