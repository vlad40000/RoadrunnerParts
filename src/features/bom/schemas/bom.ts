import { z } from "zod";

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

export const bomRowSchema = z.object({
  section: z.string().min(1),
  diagramNumber: z.union([z.number(), z.string()]),
  originalPartNumber: z.string().nullable(),
  currentServicePartNumber: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  nlaStatus: z.boolean(),
  sourceUrl: z.string().min(1),
  sourceType: z.enum([
    "oem",
    "distributor",
    "manual",
    "diagram",
    "fallback",
    "supplier_assembly",
    "variant",
    "distributor-merged-with-partselect",
  ]),
  replacementNote: z.string().nullable().optional(),
  serialApplicability: z.array(z.string()).optional(),
  serialNote: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),

  retailPrice: z.number().nullable().optional(),
  retailPriceText: z.string().nullable().optional(),
  retailAvailability: z.string().nullable().optional(),
  retailPricingUrl: z.string().nullable().optional(),
  retailPriceSource: z.string().nullable().optional(),
  retailPriceVerified: z.boolean().optional(),
  retailPricedAt: z.string().nullable().optional(),
});

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

export type BomStatus = z.infer<typeof bomStatusSchema>;
export type RetrievalState = BomStatus;
export type BomRow = z.infer<typeof bomRowSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type NormalizedIdentity = Identity;
export type DiagramParse = z.infer<typeof diagramParseSchema>;
export type BomResult = z.infer<typeof bomResultSchema>;

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
