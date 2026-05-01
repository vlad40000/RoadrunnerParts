/**
 * ROADRUNNER PARTS STREAMLINED PIPELINE REFERENCE
 * This file serves as a static reference for the 4-stage multi-agent BOM extraction process.
 * These are NOT prompts. All model calls must use isolated, contract-bound task prompts.
 */

export const BOM_PIPELINE_STAGES = {
  STAGE_1: "Evidence (Gathering nameplate photos or text clues)",
  STAGE_2: "Identity (Resolving official brand and manufacturer family)",
  STAGE_3: "BOM Extraction (Capturing part numbers, sections, and diagram references)",
  STAGE_4: "Pricing Integration (Fetching live pricing data in parallel)",
} as const;

