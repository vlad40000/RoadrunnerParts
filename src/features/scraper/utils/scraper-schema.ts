import { z } from 'zod';

/**
 * Zod schemas for the Scraper feature to ensure compatibility with
 * source-resolution and brand-gate logic.
 */

export const AgentInstructionSchema = z.object({
  id: z.string(),
  brand: z.enum(['general', 'encompass', 'marcone', 'sears']),
  instruction: z.string(),
  version: z.string().default('v1'),
  updatedAt: z.string().datetime(),
});

export const CapturedEvidenceSchema = z.object({
  jobId: z.string(),
  provider: z.string(),
  sourceUrl: z.string().url(),
  timestamp: z.string().datetime(),
  method: z.enum(['dom', 'visual', 'ocr', 'api']),
  screenshotId: z.string().optional(),
  rows: z.array(z.record(z.unknown())),
  sourceNote: z.string(),
  isComplete: z.boolean().default(false),
});

export type AgentInstruction = z.infer<typeof AgentInstructionSchema>;
export type CapturedEvidence = z.infer<typeof CapturedEvidenceSchema>;
