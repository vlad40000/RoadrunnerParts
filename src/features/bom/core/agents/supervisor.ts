import { type BomRow } from "../../schemas/bom";
import { runOemAgent } from "./oem-agent";
import { runGapFillAgent } from "./gap-fill-agent";
import { updateJobSummary } from "../../services/job-store";

export async function runBomSupervisor(input: {
  jobId: string;
  brand: string | null;
  model: string | null;
  initialRows: BomRow[];
}) {
  const logger = console;
  logger.info(`[Supervisor] Starting authoritative orchestration for Job ${input.jobId}`);

  let masterParts = input.initialRows.map((r) => ({
    ...r,
    sources: ["distributor"],
    confidence: r.confidence || 0.7,
  }));

  const { mergeMasterParts } = await import("./master-parts");
  const { saveBomArtifacts } = await import("../../services/job-store");
  const { runGroundedAiAgent } = await import("./grounded-ai-agent");

  // PASS 0: AI Grounded Search (FAST)
  // This gets a high-confidence skeleton on the screen immediately.
  logger.info(`[Supervisor] Running Grounded AI Search Pass...`);
  const aiResult = await runGroundedAiAgent({
    brand: input.brand,
    model: input.model,
    onPartialResult: async (partialRows) => {
      masterParts = mergeMasterParts(masterParts, partialRows as any[], "diagram");
      await saveBomArtifacts(input.jobId, { finalRows: masterParts });
    }
  });
  masterParts = mergeMasterParts(masterParts, aiResult as any[], "diagram");

  // Agent 1: Primary OEM / RepairClinic Extraction
  // Now with real-time population per section extracted
  const oemResult = await runOemAgent({
    brand: input.brand,
    model: input.model,
    onPartialResult: async (partialRows) => {
      masterParts = mergeMasterParts(masterParts, partialRows, "oem");
      await saveBomArtifacts(input.jobId, { finalRows: masterParts });
    }
  });

  masterParts = mergeMasterParts(masterParts, oemResult.rows, "oem");

  // Final push of the first pass
  await saveBomArtifacts(input.jobId, { finalRows: masterParts });

  await updateJobSummary(input.jobId, {
    jobStage: "oem_complete",
    actualUniqueParts: masterParts.length,
    errorText: `Primary OEM pass recovered ${oemResult.oemCount} parts. Expanding to secondary providers...`,
  });

  // Agent 2: Gap-Fill (Sears, Fix.com, PartSelect)
  // We ALWAYS run this now to ensure granular hardware and assembly completeness.
  logger.info(`[Supervisor] Running Gap-Fill Agent...`);
  const gapResult = await runGapFillAgent({
    brand: input.brand,
    model: input.model,
    currentParts: masterParts,
    onPartialResult: async (partialRows) => {
      masterParts = mergeMasterParts(masterParts, partialRows, "gap-fill");
      await saveBomArtifacts(input.jobId, { finalRows: masterParts });
    }
  });

  masterParts = gapResult.rows;
  const coveragePct = calculateCoverage(masterParts);

  const finalSummary = {
    uniqueParts: masterParts.length,
    oemCoverage: oemResult.oemCount > 0 ? "High" : "Low",
    gapFillCount: gapResult.fillCount,
    totalSources: [...new Set(["distributor", ...oemResult.sourcesUsed, ...gapResult.sourcesUsed])].length,
  };

  logger.info(`[Supervisor] Final BOM Compiled: ${masterParts.length} granular parts.`);

  await updateJobSummary(input.jobId, {
    jobStage: "complete",
    actualUniqueParts: masterParts.length,
    coveragePct,
    errorText: `BOM complete. Recovered ${masterParts.length} granular items from ${finalSummary.totalSources} sources.`,
  });

  return {
    rows: masterParts,
    summary: finalSummary,
    coveragePct,
  };
}

function calculateCoverage(rows: any[]): number {
  if (rows.length === 0) return 0;
  const sections = new Set(rows.map((r) => r.section)).size;
  // Professional BOMs for major appliances target ~10+ assemblies and ~250+ components.
  const sectionScore = Math.min(1.0, sections / 10) * 0.4;
  const partScore = Math.min(1.0, rows.length / 250) * 0.6;
  return sectionScore + partScore;
}
