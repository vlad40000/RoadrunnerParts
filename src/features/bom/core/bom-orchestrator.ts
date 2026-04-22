import { buildBomIdentityContext, type BomIdentityContext } from "./build-bom-identity-context";
import type {
  BomResult,
  BomRow,
  DiagramParse,
  Identity,
} from "../schemas/bom";
import { runIdentityExtractor } from "../agents/identity-extractor";
import { runDiagramParser } from "../agents/diagram-parser";
import { runPartsExtractor } from "../agents/parts-extractor";
import { runGroundedSynthesizer } from "../agents/grounded-synthesizer";
import { fetchAuthoritativeSources } from "../services/source-fetcher";
import { normalizeBomRows } from "./bom-normalizer";
import { computeUnmatchedCallouts, coverageScore } from "./bom-validator";
import { classifyBomResult } from "./bom-status";
import { runWithConcurrency } from "../services/providers/utils";

const logger = console;

export type BuildBomJobOutput = {
  result: BomResult;
  identity: Identity | null;
  identityContext: BomIdentityContext | null;
  diagramParse: DiagramParse;
  retrievedSources: Array<{
    sourceUrl: string;
    sourceType: "oem" | "distributor" | "manual" | "diagram" | "fallback";
    sectionName?: string;
    text: string;
  }>;
  extractedRowsRaw: BomRow[];
  finalRows: BomRow[];
};

export async function buildBomJob(input: {
  identityFiles: Array<{ mimeType: string; uri: string }>;
  diagramFiles?: Array<{ mimeType: string; uri: string }>;
  userHints?: { brand?: string; model?: string; serial?: string; productType?: string };
  mode?: "identity" | "full";
  onStage?: (stage: string) => Promise<void> | void;
  onPartialResult?: (output: Partial<BuildBomJobOutput>) => Promise<void> | void;
}): Promise<BuildBomJobOutput> {
  const mode = input.mode ?? "full";

  await input.onStage?.("extracting_identity");

  const identity = await runIdentityExtractor({
    files: input.identityFiles,
    userHints: input.userHints,
  });

  await input.onStage?.("resolving_identity_context");

  const identityContext = await buildBomIdentityContext(identity);

  if (mode === "identity" || !identity.model || identity.confidence < 0.9) {
    const status = (mode === "identity") ? "identity_only" : "identity_only";
    const issues = (identity.model && identity.confidence >= 0.9) ? [] : ["Could not confidently determine exact model."];
    
    const result: BomResult = {
      brand: identity.brand,
      model: identity.model,
      serial: identity.serial,
      productType: identity.productType,
      sectionsFound: [],
      rawRowCount: 0,
      uniqueRowCount: 0,
      unmatchedCallouts: [],
      status,
      rows: [],
      issues,
      coverageScore: 0,
    };

    return {
      result,
      identity,
      identityContext,
      diagramParse: { sections: [] },
      retrievedSources: [],
      extractedRowsRaw: [],
      finalRows: [],
    };
  }

  // 1. FIRE BACKGROUND TASKS IMMEDIATELY
  const diagramParsePromise =
    input.diagramFiles && input.diagramFiles.length
      ? runDiagramParser(input.diagramFiles)
      : Promise.resolve({ sections: [] });

  const retrievedSourcesPromise = fetchAuthoritativeSources({
    brand: identityContext.resolvedBrand ?? identity.brand,
    model: identity.model,
    productType: identity.productType,
  });

  // 2. AWAIT STAGE 1 (FAST PATH)
  await input.onStage?.("synthesizing_bom_grounded");
  
  const synthesis = await runGroundedSynthesizer({
    brand: identity.brand,
    model: identity.model,
    productType: identity.productType,
    diagramFiles: input.diagramFiles,
  });

  const synthesizedRows = normalizeBomRows(synthesis.rows);
  const sectionsFound = [...new Set(synthesizedRows.map((r) => r.section))];

  const stage1Result: BomResult = {
    brand: identity.brand,
    model: identity.model,
    serial: identity.serial,
    productType: identity.productType,
    sectionsFound,
    rawRowCount: synthesis.rows.length,
    uniqueRowCount: synthesizedRows.length,
    unmatchedCallouts: [],
    status: "synthesis_complete",
    rows: synthesizedRows,
    issues: ["Stage 1: Search-grounded synthesis complete. Expanding hardware..."],
    coverageScore: 0.5,
  };

  const stage1Output: BuildBomJobOutput = {
    result: stage1Result,
    identity,
    identityContext,
    diagramParse: { sections: [] },
    retrievedSources: [],
    extractedRowsRaw: synthesis.rows,
    finalRows: synthesizedRows,
  };

  // Push partial result to DB immediately via callback
  if (input.onPartialResult) {
    // 3. FIRE DB SAVE IN BACKGROUND (Do not await)
    // Wrap in Promise.resolve to handle potential sync return
    Promise.resolve(input.onPartialResult(stage1Output)).catch((err) =>
      logger.error("Partial save failed", err),
    );
  }

  // 4. SYNC BACK UP FOR STAGE 2
  await input.onStage?.("parsing_diagrams");
  const [diagramParse, retrievedSources] = await Promise.all([
    diagramParsePromise,
    retrievedSourcesPromise
  ]);

  if (retrievedSources.length === 0) {
    // If no authoritative sources found, we just return the synthesized result as final
    return {
      ...stage1Output,
      diagramParse,
      retrievedSources: [],
    };
  }

  await input.onStage?.("extracting_parts");

  const expandedRowsRaw = (
    await runWithConcurrency(
      retrievedSources,
      parseInt(process.env.BOM_EXTRACTOR_CONCURRENCY ?? "3", 10),
      async (source) => {
        try {
          const rows = await runPartsExtractor({
            sourceUrl: source.sourceUrl,
            sourceType: source.sourceType,
            sourceText: source.text,
          });
          return rows || [];
        } catch (err) {
          logger.error(`Extraction failed for ${source.sourceUrl}:`, err);
          return [];
        }
      }
    )
  ).flat();

  // MERGE Synthesis + Expanded Rows
  const allRowsRaw = [...synthesis.rows, ...expandedRowsRaw];
  const finalRows = normalizeBomRows(allRowsRaw);
  const finalSectionsFound = [...new Set(finalRows.map((r) => r.section))];

  const hasUserDiagramFiles = (input.diagramFiles?.length ?? 0) > 0;
  const unmatchedCallouts =
    hasUserDiagramFiles ? computeUnmatchedCallouts(diagramParse, finalRows) : [];

  const status = classifyBomResult({
    identityConfidence: identity.confidence,
    rows: finalRows,
    sectionCount: finalSectionsFound.length,
    unmatchedCalloutRatio: 0, // Placeholder
    minimumUniqueParts: 40,
    minimumSections: 3,
  });

  const issues: string[] = [];
  if (finalRows.length === 0) issues.push("Zero accepted BOM rows.");

  const result: BomResult = {
    brand: identity.brand,
    model: identity.model,
    serial: identity.serial,
    productType: identity.productType,
    sectionsFound: finalSectionsFound,
    rawRowCount: allRowsRaw.length,
    uniqueRowCount: finalRows.length,
    unmatchedCallouts,
    status,
    rows: finalRows,
    issues,
    coverageScore: coverageScore({
      rows: finalRows,
      sectionsFound: finalSectionsFound,
      unmatchedCallouts,
      minimumUniqueParts: 40,
    }),
  };

  return {
    result,
    identity,
    identityContext,
    diagramParse,
    retrievedSources,
    extractedRowsRaw: allRowsRaw,
    finalRows,
  };
}
