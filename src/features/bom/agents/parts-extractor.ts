import { z } from "zod";
import { bomRowSchema, type BomRow, type Stage3WorkerOutput } from "../schemas/bom";
import { runStructuredJson } from "../services/model-runner";
import { logger } from "@/lib/logger";
import { type ProviderSourceType } from "../services/providers/types";

const partsResultSchema = z.object({
  rows: z.array(
    z.object({
      section: z.string(),
      sectionOriginal: z.string().nullable().optional(),
      diagramNumber: z.union([z.number(), z.string()]),
      originalPartNumber: z.string().nullable(),
      currentServicePartNumber: z.string().nullable(),
      description: z.string(),
      nlaStatus: z.boolean().default(false),
      replacementNote: z.string().nullable().optional(),
      confidence: z.number().default(0.5),
      sourceUrl: z.string().nullable().optional(),
      sourceType: z.enum(["oem", "distributor", "manual", "diagram", "fallback", "seeded", "distributor-merged-with-partselect"]).nullable().optional(),
      price: z.number().nullable().optional(),
      retailPrice: z.number().nullable().optional(),
    }),
  ),
  expectedPartCount: z.number().nullable().default(null),
  expectedPartCountEvidence: z.string().default(""),
  paginationComplete: z.boolean().default(false),
  manual_review_flags: z.array(z.string()).optional(),
});

export type PartsExtractionResult = Stage3WorkerOutput;

function isExplicitNoRowsSource(sourceText: string) {
  const normalized = sourceText.toUpperCase();
  return (
    normalized.includes("ADAPTER_STATUS: NOT_IMPLEMENTED") ||
    normalized.includes("NO_PART_ROWS: TRUE")
  );
}

function parseStructuredRows(
  sourceText: string,
  sourceUrl: string,
  sourceType: ProviderSourceType | "seeded",
): BomRow[] {
  const lines = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionLine = lines.find((line) => line.startsWith("SECTION: "));
  const section = sectionLine?.replace(/^SECTION:\s*/, "").trim() ?? "UNKNOWN";

  const rowLines = lines.filter((line) => line.startsWith("ROW|"));

  if (!rowLines.length) return [];

  return rowLines.map((line) => {
    const parts = line.split("|").slice(1);
    const kv = Object.fromEntries(
      parts.map((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return [part, ""];
        return [part.slice(0, idx), part.slice(idx + 1)];
      }),
    );

    const rawDiagramNumber = kv.diagram_number || "";

    return {
      section,
      sectionOriginal: section,
      diagramNumber: /^\d+$/.test(rawDiagramNumber)
        ? Number(rawDiagramNumber)
        : rawDiagramNumber,
      originalPartNumber: kv.original_part_number || null,
      currentServicePartNumber: kv.current_service_part_number || null,
      description: kv.description || "",
      nlaStatus: kv.nla_status === "true",
      sourceUrl: kv.source_url || sourceUrl,
      sourceType: (kv.source_type as any) || sourceType,
      replacementNote: kv.replacement_note || null,
      confidence: 0.99,
      price: kv.price ? Number(kv.price) : null,
      retailPrice: kv.price ? Number(kv.price) : null,
    };
  });
}

import { 
  buildFixComExtractorPrompt, 
  buildSearsExtractorPrompt, 
  buildEncompassExtractorPrompt, 
  buildManualExtractorPrompt, 
  buildDiagramExtractorPrompt,
  buildPricingExtractionPrompt 
} from "../prompts/parts";

export async function runPartsExtractor(input: {
  sourceText: string;
  sourceUrl: string;
  sourceType: ProviderSourceType | "seeded";
  provider?: string;
  modelNumber: string;
  applianceType?: string | null;
  fuelType?: string | null;
  cachedParts?: BomRow[];
  missingSections?: string[];
}): Promise<PartsExtractionResult> {
  const deterministic = parseStructuredRows(
    input.sourceText,
    input.sourceUrl,
    input.sourceType,
  );

  if (deterministic.length > 0) {
    return {
      rows: deterministic.map((row) => bomRowSchema.parse(row)),
      expectedPartCount: null,
      expectedPartCountEvidence: "deterministic_structure",
      paginationComplete: true,
    };
  }

  if (isExplicitNoRowsSource(input.sourceText)) {
    return {
      rows: [],
      expectedPartCount: 0,
      expectedPartCountEvidence: "explicit_no_rows",
      paginationComplete: true,
    };
  }

  // Select specialized prompt based on provider or sourceType
  let prompt: string;
  const provider = input.provider?.toLowerCase() || "";
  
  if (provider.includes("fix.com")) {
    prompt = buildFixComExtractorPrompt({ model: input.modelNumber });
  } else if (provider.includes("sears")) {
    prompt = buildSearsExtractorPrompt({ model: input.modelNumber });
  } else if (provider.includes("encompass")) {
    prompt = buildEncompassExtractorPrompt({ model: input.modelNumber });
  } else if (input.sourceType === "manual" || input.sourceType === "oem") {
    prompt = buildManualExtractorPrompt({ model: input.modelNumber });
  } else if (input.sourceType === "diagram") {
    prompt = buildDiagramExtractorPrompt({ model: input.modelNumber });
  } else {
    prompt = buildPricingExtractionPrompt({
      model: input.modelNumber,
      applianceType: input.applianceType,
      fuelType: input.fuelType,
    });
  }

  const raw = await runStructuredJson<any>({
    prompt,
    text: input.sourceText,
    temperature: 0,
  });

  const parsed = partsResultSchema.parse(raw);
  
  const rows = (parsed.rows || [])
    .filter((row: any) => (row.confidence ?? 0.5) >= 0.7)
    .map((row: any) =>
      bomRowSchema.parse({
        ...row,
        sourceUrl: row.sourceUrl || input.sourceUrl,
        sourceType: row.sourceType || input.sourceType,
        price: row.price || row.retailPrice || null,
        priceMissing: !(row.price || row.retailPrice),
      }),
    );

  return {
    rows,
    expectedPartCount: parsed.expectedPartCount,
    expectedPartCountEvidence: parsed.expectedPartCountEvidence,
    paginationComplete: parsed.paginationComplete,
  };
}
