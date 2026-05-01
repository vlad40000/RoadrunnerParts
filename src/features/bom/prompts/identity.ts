import { EXECUTION_CONTRACT } from './contract';

/**
 * STEP 1 — Identity Extraction
 * Task: Extract appliance identity clues.
 */
export const identityExtractionPrompt = `
${EXECUTION_CONTRACT}
You are completing exactly one bounded extraction task.
You are not managing a workflow.
You are not writing prompts.
You are not simulating tools.
You are not querying databases.
You are not fetching sources.
You are not searching the web.
You are not extracting parts.
You are not inventing part counts.
You are not continuing prior context.
You are not using memory.
Return only the requested JSON object.

TASK:
Extract visible appliance identity fields from the provided nameplate evidence and carry downstream BOM requirements forward.

INPUT:
[INSERT NAMEPLATE IMAGE, OCR TEXT, OR USER-PROVIDED NAMEPLATE TEXT]

RULES:
Extract only what is visible or explicitly provided.
Do not normalize yet.
Do not correct OCR unless visually obvious.
Do not infer missing digits, OEM family, or compatibility.
Do not extract parts.
Do not search for the model.
Do not claim database, provider, source lookup, or total part count.
If a value is unclear, return null and add a manual_review_flags entry.
Preserve raw visible text as closely as possible.

DOWNSTREAM BOM REQUIREMENTS:
The downstream parts agent must determine source_total_part_count early from source evidence.
The downstream parts agent must attempt 40+ verified, non-duplicate rows per pass.
The downstream parts agent must not claim total_part_count unless explicitly visible.
If fewer than 40 rows are returned downstream, it must provide source_exhausted=true or shortfall_reason.
These are downstream requirements only. Do not extract BOM rows in this step.

OUTPUT JSON:
{
  "step": "nameplate_identity_extraction",
  "status": "complete",
  "raw_text": "",
  "candidate_identity": {
    "brand": null,
    "model": null,
    "serial": null,
    "type_code": null,
    "product_type": null,
    "appliance_type": null,
    "fuel_type": null,
    "voltage_or_power_clues": [],
    "wire_connection": null
  },
  "confidence": {
    "brand": 0,
    "model": 0,
    "serial": 0,
    "type_code": 0,
    "appliance_type": 0,
    "fuel_type": 0
  },
  "evidence_used": [],
  "manual_review_flags": [],
  "downstream_bom_requirements": {
    "source_total_part_count_required": true,
    "source_total_part_count_rule": "Do not claim total_part_count unless explicit evidence is present.",
    "target_rows_per_pass": 40,
    "minimum_rows_rule": "Return 40+ verified non-duplicate rows per pass unless the source contains fewer.",
    "shortfall_required_when_under_target": true,
    "duplicate_policy": "Do not repeat previous_pass_part_numbers.",
    "no_padding_policy": "Never invent rows, placeholder part numbers, prices, sections, or compatibility."
  },
  "next_required_step": "identity_normalization",
  "input_payload_for_next_step": {
    "brand": null,
    "model": null,
    "serial": null,
    "type_code": null,
    "product_type": null,
    "appliance_type": null,
    "fuel_type": null,
    "voltage_or_power_clues": [],
    "wire_connection": null,
    "raw_text": "",
    "downstream_bom_requirements": {
      "source_total_part_count_required": true,
      "target_rows_per_pass": 40,
      "shortfall_required_when_under_target": true,
      "no_total_part_count_without_source_evidence": true
    }
  }
}
`.trim();

/**
 * STEP 2 — Identity Normalization
 * Task: Map extracted clues to a canonical OEM brand and family.
 */
export const identityNormalizationPrompt = `
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
Normalize already-extracted appliance identity fields.

INPUT:
{
  "brand": null,
  "resolved_oem_brand": null,
  "manufacturer_family": null,
  "model": null,
  "serial": null,
  "type_code": null,
  "appliance_type": null,
  "fuel_type": null,
  "manual_review_flags": []
}

RULES:
Preserve unknowns as null.
Trim whitespace.
Uppercase model and serial values.
Do not invent OEM family.
Do not infer compatibility.
If evidence is unclear, add it to manual_review_flags.

OUTPUT JSON:
{
  "brand": null,
  "resolved_oem_brand": null,
  "manufacturer_family": null,
  "model": null,
  "serial": null,
  "type_code": null,
  "appliance_type": null,
  "fuel_type": null,
  "normalization_actions": [],
  "manual_review_flags": []
}
`.trim();
