import { z } from "zod";

export const clueSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
});

export const normalizedIdentitySchema = z.object({
  brand: z.string().nullable(),
  resolved_oem_brand: z.string().nullable(),
  manufacturer_family: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  type_code: z.string().nullable(),
  appliance_type: z.string().nullable(),
  fuel_type: z.string().nullable(),
  expectedPartCount: z.number().int().optional(),
  manual_review_flags: z.array(z.string()).default([]),
});

export const candidateIdentitySchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  type_code: z.string().nullable(),
  product_type: z.string().nullable(),
  appliance_type: z.string().nullable(),
  fuel_type: z.string().nullable(),
  voltage_or_power_clues: z.array(z.string()).default([]),
  wire_connection: z.string().nullable(),
});

export const stage1OutputSchema = z.object({
  step: z.string().optional(),
  status: z.enum(["complete", "success", "failed"]),
  raw_text: z.string(),
  candidate_identity: candidateIdentitySchema,
  confidence: z.record(z.number()).optional(),
  evidence_used: z.array(z.string()).default([]),
  manual_review_flags: z.array(z.string()).default([]),
  downstream_bom_requirements: z.any().optional(),
  next_required_step: z.string().optional(),
  input_payload_for_next_step: z.any().optional(),
});

export type Stage1Output = z.infer<typeof stage1OutputSchema>;

export const stage2OutputSchema = normalizedIdentitySchema.extend({
  status: z.enum(["success", "failed"]),
});

export type Stage2Output = z.infer<typeof stage2OutputSchema>;

export const bomRowSchema = z.object({
  section: z.string().min(1),
  sectionOriginal: z.string().nullable().optional(),
  diagramNumber: z.union([z.number(), z.string()]),
  originalPartNumber: z.string().nullable(),
  currentServicePartNumber: z.string().nullable(),
  description: z.string().min(1),
  nlaStatus: z.boolean(),
  sourceUrl: z.string().min(1),
  sourceType: z.enum(["oem", "distributor", "manual", "diagram", "fallback", "seeded"]),
  imageUrl: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
  replacementNote: z.string().nullable().optional(),
  serialNote: z.string().nullable().optional(),
  serialApplicability: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),

  retailPrice: z.object({
    status: z.enum([
      "verified_price",
      "encompass_no_price",
      "fallback_verified_price",
      "no_verified_price",
      "ambiguous_match",
      "blocked",
      "source_error"
    ]),
    source: z.string().optional(),
    listedPrice: z.number().nullable().optional(),
    currency: z.literal("USD").optional(),
    productUrl: z.string().nullable().optional(),
    checkedAt: z.string().nullable().optional(),
    matchType: z.literal("exact_part_number").optional(),
    requestedPartNumber: z.string().optional(),
    matchedPartNumber: z.string().optional(),
  }).nullable().optional(),
  retailPriceText: z.string().nullable().optional(),
  retailAvailability: z.string().nullable().optional(),
  retailPricingUrl: z.string().nullable().optional(),
  retailPriceSource: z.string().nullable().optional(),
  retailPriceVerified: z.boolean().optional(),
  retailPricedAt: z.string().nullable().optional(),

  price: z.number().nullable().optional(),
  priceMissing: z.boolean().default(true),
});

export const stage3WorkerOutputSchema = z.object({
  rows: z.array(bomRowSchema),
  expectedPartCount: z.number().nullable(),
  expectedPartCountEvidence: z.string(),
  paginationComplete: z.boolean(),
});

export type Stage3WorkerOutput = z.infer<typeof stage3WorkerOutputSchema>;

export const completionProofSchema = z.object({
  expectedPartCount: z.number().int().nonnegative(),
  totalExtracted: z.number().int().nonnegative(),
  coverageRatio: z.number().min(0).max(1),
  sourceAgreement: z.boolean(),
});

export const retrievalStateSchema = z.enum([
  "not_checked",
  "no_result",
  "identity_only",
  "identity_extraction",
  "identity_normalization",
  "sources_resolved",
  "summary_only",
  "parts_partial",
  "parts_complete_pricing_missing",
  "parts_complete_pricing_partial",
  "needs_fallback",
  "bom_near_complete",
  "bom_complete",
  "db_complete",
  "seed_route_only",
  "seed_sections_only",
  "seed_parts_partial",
  "seed_bom_candidate",
  "needs_live_gap_fill",
  "cache_hit",
  "failed",
  "stage0_seed_intake",
  "bom_synthesis"
]);

export type RetrievalState = z.infer<typeof retrievalStateSchema>;

export const bomStatusSchema = retrievalStateSchema;

export type BomStatus = RetrievalState;

export const bomResultSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  productType: z.string().nullable(),
  sectionsFound: z.array(z.string()),
  rawRowCount: z.number().int().nonnegative(),
  uniqueRowCount: z.number(),
  unmatchedCallouts: z.array(z.string()).default([]),
  status: bomStatusSchema,
  retrievalState: retrievalStateSchema,
  expectedPartCount: z.number().int().nullable(),
  actualPartCount: z.number().int().nonnegative(),
  requiredPriceCount: z.number().int().nonnegative(),
  verifiedPriceCount: z.number().int().nonnegative(),
  unpricedCount: z.number().int().nonnegative(),
  bomComplete: z.boolean(),
  partsComplete: z.boolean(),
  pricingComplete: z.boolean(),
  rows: z.array(bomRowSchema),
  issues: z.array(z.string()).default([]),
  notices: z.array(
    z.object({
      type: z.enum(["info", "success", "warning", "error"]),
      stage: z.string(),
      message: z.string(),
    })
  ).default([]),
  msrp: z.object({
    amount: z.number().nullable(),
    currency: z.string().default("USD"),
    confidence: z.enum(["high", "medium", "low", "none"]),
    sourceUrl: z.string().nullable(),
    evidence: z.string().nullable(),
  }).optional(),
  manufactureDate: z.string().nullable().optional(),
  coverageScore: z.number().min(0).max(1).default(0),
  truthSource: z.string().nullable().optional(),
  sourceStrategy: z.string().nullable().optional(),
  expectedPartsTotal: z.number().int().nullable().optional(),
  expectedPartsSource: z.string().nullable().optional(),
  completionProof: completionProofSchema.optional(),
});

export const stage4OutputSchema = bomResultSchema;

export type Stage4Output = z.infer<typeof stage4OutputSchema>;



export const stage0OutputSchema = z.object({
  seed_lookup_result: z.object({
    found: z.boolean(),
    sourceUrl: z.string().nullable(),
    sourceType: z.string().nullable(),
    rawText: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  }).nullable(),
});

export type Stage0Output = z.infer<typeof stage0OutputSchema>;

export const buildBomJobStateSchema = z.object({
  retrievalState: retrievalStateSchema,
  nextRequiredStep: z.string(),
  identity: stage1OutputSchema.nullable(),
  normalizedIdentity: stage2OutputSchema.nullable(),
  trustedSources: z.array(z.string()),
  rejectedSources: z.array(z.string()),
  expectedPartCount: z.number().nullable(),
  actualPartCount: z.number().default(0),
  requiredPriceCount: z.number().default(0),
  verifiedPriceCount: z.number().default(0),
  unpricedCount: z.number().default(0),
  coverageRatio: z.number().nullable(),
  paginationComplete: z.boolean(),
  bomRows: z.array(bomRowSchema),
  errors: z.array(z.string()),
  notices: z.array(
    z.object({
      type: z.enum(["info", "success", "warning", "error"]),
      stage: z.string(),
      message: z.string(),
    })
  ).default([]),
});

export type BuildBomJobState = z.infer<typeof buildBomJobStateSchema>;


export const identitySchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  productType: z.string().nullable(),
  applianceType: z.string().nullable().optional(),
  fuelType: z.enum(["gas", "electric", "other"]).nullable().optional(),
  manufactureDate: z.string().nullable().optional(),
  engineeringCode: z.string().nullable().optional(),
  alternates: z.array(z.string()).default([]),
  confidence: z.union([
    z.number(),
    z.object({
      brand: z.number(),
      modelNumber: z.number(),
      serialNumber: z.number(),
      productType: z.number(),
    }).passthrough()
  ]).default(0),
  clues: z.array(clueSchema).optional(),
  rawText: z.string().optional(),
});

export const diagramSectionSchema = z.object({
  sectionName: z.string().min(1),
  callouts: z.array(z.union([z.number(), z.string()])),
});

export const diagramParseSchema = z.object({
  sections: z.array(diagramSectionSchema),
});


export type BomRow = z.infer<typeof bomRowSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type DiagramParse = z.infer<typeof diagramParseSchema>;
export type BomResult = z.infer<typeof bomResultSchema>;
export type Clue = z.infer<typeof clueSchema>;
export type NormalizedIdentity = z.infer<typeof normalizedIdentitySchema>;
