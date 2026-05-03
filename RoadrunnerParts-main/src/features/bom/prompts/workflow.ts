/**
 * ROADRUNNER PARTS FINAL PIPELINE REFERENCE
 * These are NOT prompts. All model calls must use isolated, contract-bound task prompts.
 * Encompass acts as the Visual Supervisor for all stages.
 */

export const BOM_PIPELINE_STAGES = {
  STAGE_1: "OCR/Manual Entry",
  STAGE_2: "Resolve Encompass URL",
  STAGE_3: "Fetch Model Option",
  STAGE_4: "Build Exploded-View URL",
  STAGE_5: "Capture Visual Truth (Encompass Overview)",
  STAGE_6: "Extract Canonical Manifest (Totals/Names)",
  STAGE_7: "Show Screenshot Context",
  STAGE_8: "Populate Supplier Rows",
  STAGE_9: "Independent Agent Execution",
  STAGE_10: "Agent Context Handover",
  STAGE_11: "Schema-Valid Extraction",
  STAGE_12: "Reconciliation Merge against Visual Truth",
} as const;

export type BomPipelineStage = keyof typeof BOM_PIPELINE_STAGES;
