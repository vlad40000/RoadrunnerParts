import { z } from "zod";

export const clueSchema = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
});

export const normalizedIdentitySchema = z.object({
  brand: z.string().nullable().optional(),
  resolved_oem_brand: z.string().nullable().optional(),
  manufacturer_family: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial: z.string().nullable().optional(),
  appliance_type: z.string().nullable().optional(),
  expectedPartCount: z.number().int().optional(),
  manual_review_flags: z.array(z.string()).default([]),
  normalization_status: z.enum([
    "complete",
    "partial",
    "ambiguous",
    "failed"
  ]).default("complete"),
  evidence: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  next_action: z.string().nullable().optional(),
});

export const candidateIdentitySchema = z.object({
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial: z.string().nullable().optional(),
  appliance_type: z.string().nullable().optional(),
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

export const diagramMapStatusSchema = z.enum([
  "matched_exact",
  "matched_substitute",
  "matched_cross_reference",
  "expected_but_not_found",
  "found_but_not_in_manifest",
  "duplicate_found",
  "ambiguous_match",
  "not_orderable",
  "diagram_only",
]);

export type DiagramMapStatus = z.infer<typeof diagramMapStatusSchema>;

export const pricingStatusSchema = z.enum([
  "verified_price",
  "fallback_verified_price",
  "no_verified_price",
  "exact_part_found_no_price",
  "part_not_found",
  "ambiguous_match",
  "blocked",
  "source_error",
]);

export type PricingStatus = z.infer<typeof pricingStatusSchema>;

export const diagramManifestRowSchema = z.object({
  sectionName: z.string().min(1),
  sectionUrl: z.string().nullable().optional(),
  diagramKey: z.string().min(1),
  callout: z.string().nullable().optional(),
  expectedPartNumber: z.string().nullable().optional(),
  expectedPartName: z.string().nullable().optional(),
  quantity: z.number().int().positive().default(1),
  rowType: z.enum(["required", "not_orderable", "diagram_only", "optional"]).default("required"),
  sourceUrl: z.string().min(1),
  raw: z.record(z.unknown()).default({}),
});

export type DiagramManifestRow = z.infer<typeof diagramManifestRowSchema>;

export const bomPartMappingSchema = z.object({
  normalizedModel: z.string().min(1),
  manifestRowId: z.union([z.number().int(), z.string()]),
  bomPartId: z.union([z.number().int(), z.string()]).nullable().optional(),
  expectedPartNumber: z.string().nullable().optional(),
  foundPartNumber: z.string().nullable().optional(),
  mappingStatus: diagramMapStatusSchema,
  mappingConfidence: z.number().min(0).max(1).nullable().optional(),
  evidenceSource: z.string().nullable().optional(),
  evidenceUrl: z.string().nullable().optional(),
  raw: z.record(z.unknown()).default({}),
});

export type BomPartMapping = z.infer<typeof bomPartMappingSchema>;

export const bomRowSchema = z.object({
  section: z.string().min(1),
  sectionOriginal: z.string().nullable().optional(),
  diagramNumber: z.union([z.number(), z.string()]),
  originalPartNumber: z.string().nullable(),
  currentServicePartNumber: z.string().nullable(),
  description: z.string().min(1),
  nlaStatus: z.boolean().default(false),
  sourceUrl: z.string().min(1),
  sourceType: z.enum(["oem", "distributor", "manual", "diagram", "fallback", "seeded", "distributor-merged-with-partselect"]),
  imageUrl: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
  replacementNote: z.string().nullable().optional(),
  serialNote: z.string().nullable().optional(),
  serialApplicability: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),

  retailPrice: z.object({
    status: pricingStatusSchema,
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

export type BomRow = z.infer<typeof bomRowSchema>;

export const stage3WorkerOutputSchema = z.object({
  rows: z.array(bomRowSchema),
  expectedPartCount: z.number().nullable(),
  expectedPartCountEvidence: z.string(),
  trustedTotalPartCount: z.number().int().positive().nullable().optional(),
  trustedTotalCountSource: z.string().nullable().optional(),
  trustedTotalCountSourceUrl: z.string().nullable().optional(),
  trustedTotalCountCheckedAt: z.string().nullable().optional(),
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
  "identity_extraction",
  "identity_normalization",
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
  trustedTotalPartCount: z.number().int().nullable().optional(),
  trustedTotalCountSource: z.string().nullable().optional(),
  trustedTotalCountSourceUrl: z.string().nullable().optional(),
  trustedTotalCountCheckedAt: z.string().nullable().optional(),
  actualPartCount: z.number().int().nonnegative(),
  actualCanonicalPartCount: z.number().int().nonnegative().optional(),
  requiredPriceCount: z.number().int().nonnegative(),
  verifiedPriceCount: z.number().int().nonnegative(),
  unpricedCount: z.number().int().nonnegative(),
  bomComplete: z.boolean(),
  partsComplete: z.boolean(),
  pricingComplete: z.boolean(),
  manifestRowCount: z.number().int().nonnegative().optional(),
  requiredManifestRowCount: z.number().int().nonnegative().optional(),
  mappedRequiredManifestRowCount: z.number().int().nonnegative().optional(),
  unresolvedRequiredManifestRowCount: z.number().int().nonnegative().optional(),
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

export type BomResult = z.infer<typeof bomResultSchema>;

export const stage4OutputSchema = bomResultSchema;

export type Stage4Output = z.infer<typeof stage4OutputSchema>;
export const listedPriceStatusSchema = z.enum([
  "verified_price",
  "fallback_verified_price",
  "no_verified_price",
  "exact_part_found_no_price",
  "part_not_found",
  "ambiguous_match",
  "blocked",
  "source_error",
]);

export type ListedPriceStatus = z.infer<typeof listedPriceStatusSchema>;

export const verifiedRetailPriceSchema = z.object({
  status: z.enum(["verified_price", "fallback_verified_price"]),
  source: z.string(),
  listedPrice: z.number(),
  currency: z.literal("USD"),
  productUrl: z.string(),
  checkedAt: z.string(),
  matchType: z.literal("exact_part_number"),
  requestedPartNumber: z.string(),
  matchedPartNumber: z.string(),
});

export type VerifiedRetailPrice = z.infer<typeof verifiedRetailPriceSchema>;

export const noVerifiedPriceSchema = z.object({
  status: z.literal("no_verified_price"),
  source: z.null(),
  listedPrice: z.null(),
  currency: z.null(),
  productUrl: z.null(),
  checkedAt: z.null(),
  matchType: z.null(),
});

export type NoVerifiedPrice = z.infer<typeof noVerifiedPriceSchema>;


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
  trustedTotalPartCount: z.number().nullable().optional(),
  trustedTotalCountSource: z.string().nullable().optional(),
  trustedTotalCountSourceUrl: z.string().nullable().optional(),
  trustedTotalCountCheckedAt: z.string().nullable().optional(),
  actualPartCount: z.number().default(0),
  actualCanonicalPartCount: z.number().default(0),
  manifestRowCount: z.number().default(0),
  requiredManifestRowCount: z.number().default(0),
  mappedRequiredManifestRowCount: z.number().default(0),
  unresolvedRequiredManifestRowCount: z.number().default(0),
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

export const manifestCoverageSchema = z.object({
  trustedTotalPartCount: z.number().int().positive().nullable(),
  manifestRowCount: z.number().int().nonnegative(),
  requiredManifestRowCount: z.number().int().nonnegative(),
  mappedRequiredManifestRowCount: z.number().int().nonnegative(),
  unresolvedRequiredManifestRowCount: z.number().int().nonnegative(),
  actualCanonicalPartCount: z.number().int().nonnegative(),
  partsComplete: z.boolean(),
  reason: z.string(),
});

export const bomCompletionContractSchema = manifestCoverageSchema.extend({
  requiredPriceCount: z.number().int().nonnegative(),
  verifiedPriceCount: z.number().int().nonnegative(),
  pricingComplete: z.boolean(),
  bomComplete: z.boolean(),
});

export type ManifestCoverage = z.infer<typeof manifestCoverageSchema>;
export type BomCompletionContractOutput = z.infer<typeof bomCompletionContractSchema>;


export const identitySchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  productType: z.string().nullable(),
  applianceType: z.string().nullable().optional(),
  manufactureDate: z.string().nullable().optional(),
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


export const sourceResolutionCandidateSchema = z.object({
  source: z.string(),
  url: z.string(),
  match_type: z.enum(["exact_model", "exact_variant", "rejected_nearby_model", "rejected_brand_mismatch"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string()
});

export const sourceResolutionResultSchema = z.object({
  status: z.enum(["sources_resolved", "partial", "no_result"]),
  source_policy: z.string().default("distributor_only"),
  model: z.string().nullable(),
  brand: z.string().nullable(),
  manufacturer_family: z.string().nullable(),
  searched_sources: z.array(z.string()),
  skipped_sources: z.array(z.object({
    source: z.string(),
    reason: z.string()
  })).default([]),
  resolved_candidates: z.array(sourceResolutionCandidateSchema),
  next_tool: z.enum(["url_context", "browser_assist", "stop"]).default("stop"),
});

export type SourceResolutionCandidate = z.infer<typeof sourceResolutionCandidateSchema>;
export type SourceResolutionResult = z.infer<typeof sourceResolutionResultSchema>;

export type Identity = z.infer<typeof identitySchema>;
export type DiagramParse = z.infer<typeof diagramParseSchema>;
export type Clue = z.infer<typeof clueSchema>;
export type NormalizedIdentity = z.infer<typeof normalizedIdentitySchema>;
