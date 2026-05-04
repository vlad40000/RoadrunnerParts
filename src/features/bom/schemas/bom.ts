import { z } from "zod";

/**
 * BOM Status - Operational states for the BOM processing engine
 */
export const bomStatusSchema = z.enum([
  "identity_only",
  "zero_rows",
  "diagram_parsed",
  "parts_partial",
  "synthesis_complete",
  "bom_complete",
  "needs_fallback",
  "bom_near_complete",
  "failed",
  "no_result",
  "parts_complete_pricing_missing",
  "parts_complete_pricing_partial",
  "sources_resolved",
]);

export const retrievalStateSchema = bomStatusSchema;
export type BomStatus = z.infer<typeof bomStatusSchema>;
export type RetrievalState = BomStatus;

/**
 * Agent Metadata - Execution context for the supplier agent
 */
export const agentMetadataSchema = z.object({
  agent_id: z.string(),
  supplier_id: z.enum([
    "fix",
    "fix.com",
    "repairclinic",
    "repairclinic-family",
    "appliancepartspros",
    "sears",
    "sears-partsdirect",
    "encompass",
    "encompass-family",
  ]),
  source_url: z.string(),
  encompass_overview_used: z.boolean(),
  expected_total_used: z.boolean(),
  timestamp: z.string(), // ISO String
  status: z.enum(["success", "partial", "no_result", "blocked", "failed"]),
});

/**
 * Model Identity - Normalized model information
 */
export const modelIdentitySchema = z.object({
  normalized_model: z.string(),
  brand: z.string().nullable(),
  product_type: z.string().nullable(),
});

/**
 * Encompass Anchor - The "Visual Truth" source reference
 */
export const encompassAnchorSchema = z.object({
  canon_url: z.string().nullable(),
  diagram_image_url: z.string().nullable(),
  expected_total: z.number().nullable(),
  assembly_names: z.array(z.string()),
});

/**
 * Tightened BOM Row - High-fidelity part data
 */
export const bomRowSchema = z.object({
  // TIGHTENED FIELDS
  part_number: z.string(),
  description: z.string().nullable(),
  callout_number: z.string().nullable(),
  quantity: z.number().int().nonnegative().default(1),
  price_cents: z.number().nullable(),
  currency: z.enum(["USD"]).nullable(),
  availability_status: z.string().nullable(),
  mapped_encompass_assembly: z.string().nullable(),
  mapping_status: z.enum([
    "mapped",
    "unmapped",
    "verified",
    "potential_mismatch",
    "duplicate_suspect",
  ]),
  confidence: z.number(),
  evidence_text: z.string().nullable(),
  
  // LEGACY COMPATIBILITY FIELDS (kept for existing app code)
  section: z.string().optional(),
  diagramNumber: z.union([z.number(), z.string()]).optional(),
  diagram: z
    .object({
      diagramId: z.string().nullable().optional(),
      diagramName: z.string().nullable().optional(),
      diagramUrl: z.string().nullable().optional(),
    })
    .optional(),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  originalPartNumber: z.string().nullable().optional(),
  currentServicePartNumber: z.string().nullable().optional(),
  sourceUrl: z.string().optional(),
  sourceType: z.string().optional(),
  nlaStatus: z.boolean().optional(),
  replacementNote: z.string().nullable().optional(),
  serialApplicability: z.array(z.string()).optional(),
  serialNote: z.string().nullable().optional(),
  
  retailPrice: z.number().nullable().optional(),
  retailPriceText: z.string().nullable().optional(),
  retailAvailability: z.string().nullable().optional(),
  retailPricingUrl: z.string().nullable().optional(),
  retailPriceSource: z.string().nullable().optional(),
  retailPriceVerified: z.boolean().optional(),
  retailPricedAt: z.string().nullable().optional(),
});

/**
 * BOM Assembly - Grouped parts by assembly
 */
export const bomAssemblySchema = z.object({
  assembly_name: z.string(),
  supplier_section_name: z.string().nullable(),
  parts: z.array(bomRowSchema),
});

/**
 * BOM Data - The core extracted parts data
 */
export const bomDataSchema = z.object({
  total_rows_found: z.number(),
  unique_part_numbers_found: z.number(),
  expected_total: z.number().nullable(),
  assemblies: z.array(bomAssemblySchema),
});

/**
 * Reconciliation - Merge logic and coverage flags
 */
export const potentialMismatchSchema = z.object({
  part_number: z.string(),
  reason: z.string(),
});

export const reconciliationSchema = z.object({
  matches_encompass_diagram: z.enum(["yes", "partial", "no", "not_checked"]),
  coverage_ratio: z.number().nullable(),
  missing_from_source: z.array(z.string()),
  extra_parts_found: z.array(z.string()),
  potential_mismatches: z.array(potentialMismatchSchema),
});

/**
 * Supplier Agent Response - The final high-fidelity response type
 */
export const supplierAgentResponseSchema = z.object({
  agent_metadata: agentMetadataSchema,
  model_identity: modelIdentitySchema,
  bom_data: bomDataSchema,
  reconciliation: reconciliationSchema,
  errors: z.array(z.string()),
});

export type BomRow = z.infer<typeof bomRowSchema>;
export type AgentMetadata = z.infer<typeof agentMetadataSchema>;
export type ModelIdentity = z.infer<typeof modelIdentitySchema>;
export type EncompassAnchor = z.infer<typeof encompassAnchorSchema>;
export type BomData = z.infer<typeof bomDataSchema>;
export type Reconciliation = z.infer<typeof reconciliationSchema>;
export type SupplierAgentResponse = z.infer<typeof supplierAgentResponseSchema>;

// Keep existing schemas for backward compatibility during transition
export const identitySchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  productType: z.string().nullable(),
  alternates: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export const diagramSectionSchema = z.object({
  sectionName: z.string().min(1),
  callouts: z.array(z.union([z.number(), z.string()])),
});

export const diagramParseSchema = z.object({
  sections: z.array(diagramSectionSchema),
});

export const bomResultSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  productType: z.string().nullable(),
  sectionsFound: z.array(z.string()),
  rawRowCount: z.number().int().nonnegative(),
  uniqueRowCount: z.number().int().nonnegative(),
  unmatchedCallouts: z.array(z.union([z.number(), z.string()])),
  status: bomStatusSchema,
  rows: z.array(bomRowSchema),
  issues: z.array(z.string()).default([]),
  coverageScore: z.number().min(0).max(1).default(0),
});

export type Identity = z.infer<typeof identitySchema>;
export type DiagramParse = z.infer<typeof diagramParseSchema>;
export type BomResult = z.infer<typeof bomResultSchema>;

// Stage 0 Output (Legacy)
export const stage0OutputSchema = z.object({
  seed_lookup_result: z
    .object({
      found: z.boolean(),
      sourceUrl: z.string().nullable(),
      sourceType: z.string().nullable(),
      rawText: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    })
    .nullable(),
});

export type Stage0Output = z.infer<typeof stage0OutputSchema>;
export type NormalizedIdentity = Identity;
