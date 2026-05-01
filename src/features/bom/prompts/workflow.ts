/**
 * ROADRUNNER PARTS FINAL PIPELINE REFERENCE
 * These are NOT prompts. All model calls must use isolated, contract-bound task prompts.
 * Computer Use is excluded from this workflow.
 */

export const BOM_PIPELINE_STAGES = {
  STAGE_0: "Runtime Contract Prompt",
  STAGE_1: "Orchestrator Prompt",
  STAGE_2: "Nameplate Ingest Prompt",
  STAGE_3: "Identity Normalize Prompt",
  STAGE_4: "DB Cache / Completeness Prompt",
  STAGE_5: "Source Resolver Prompt",
  STAGE_6: "URL Context / Grounding Prompt",
  STAGE_7: "Diagram Manifest Prompt",
  STAGE_8: "Parts Extraction Prompt",
  STAGE_9: "Manifest Mapping / BOM Synthesis Prompt",
  STAGE_10: "Retail Pricing Prompt",
  STAGE_11: "Fallback Pricing Prompt",
  STAGE_12: "Final BOM Audit Prompt",
  STAGE_13: "Final UI Summary Prompt",
} as const;
