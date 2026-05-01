import "server-only";

import {
  getBomJob,
  saveBomArtifacts,
  setBomJobStage,
  updateBomJobSummary,
} from "@/features/bom/services/job-store";
import { fetchSourcesFromSpecificProviders } from "@/features/bom/services/source-fetcher";
import { runPartsExtractor } from "@/features/bom/agents/parts-extractor";
import { enrichBomRowsWithRetailPricing } from "@/features/bom/services/retail-pricing";
import { validate_bom_completion } from "@/features/bom/core/bom-validator";

export async function runSourceActionAgent(input: {
  jobId: string;
  task: "parts_diagrams" | "parts_bom" | "pricing";
  tierKey: string;
  supplier: string;
  canonicalModel: string;
  formattedModel?: string;
  searchUrl?: string;
  brand?: string | null;
  serial?: string | null;
  productType?: string | null;
  assemblyTitle?: string | null;
  expectedGroupPartCount?: number | null;
  pricingOrder?: string[];
}) {
  const job = await getBomJob(input.jobId);
  if (!job) throw new Error("BOM job not found");

  if (input.task === "parts_diagrams") {
    await setBomJobStage(input.jobId, "source_action_diagrams_running");

    const sources = await fetchSourcesFromSpecificProviders({
      brand: input.brand ?? null,
      model: input.canonicalModel,
      productType: input.productType ?? null,
      providerNames: [input.supplier],
    });

    await saveBomArtifacts(input.jobId, {
      retrievedSources: sources.map((source) => ({
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        sectionName: source.sectionName,
        text: source.text,
      })),
      diagramParse: {
        supplier: input.supplier,
        canonicalModel: input.canonicalModel,
        formattedModel: input.formattedModel,
        searchUrl: input.searchUrl,
        diagramSheets: sources.map((source) => ({
          title: source.sectionName || "All Model Parts",
          sourceUrl: source.sourceUrl,
          supplier: source.provider,
          expectedPartCount: null,
          userExpectedPartCount: null,
          selected: false,
        })),
      },
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "source_action_diagrams_complete",
      retrievalState: sources.length ? "sources_resolved" : "summary_only",
      truthSource: sources[0]?.sourceUrl ?? job.truthSource,
    });

    return;
  }

  if (input.task === "parts_bom") {
    await setBomJobStage(input.jobId, "source_action_bom_running");

    const sources = await fetchSourcesFromSpecificProviders({
      brand: input.brand ?? null,
      model: input.canonicalModel,
      productType: input.productType ?? null,
      providerNames: [input.supplier],
      targetSections: input.assemblyTitle ? [input.assemblyTitle] : undefined,
    });

    const extracted = [];

    for (const source of sources) {
      const result = await runPartsExtractor({
        sourceText: source.text,
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType as any,
        provider: source.provider,
        modelNumber: input.canonicalModel,
      });

      extracted.push(...result.rows);
    }

    const existingRows = Array.isArray(job.finalRows) ? job.finalRows : [];
    const mergedRows = [...existingRows, ...extracted];

    await saveBomArtifacts(input.jobId, {
      retrievedSources: sources.map((source) => ({
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        sectionName: source.sectionName,
        text: source.text,
      })),
      extractedRowsRaw: mergedRows as any,
      finalRows: mergedRows as any,
      issues:
        input.expectedGroupPartCount &&
        extracted.length < input.expectedGroupPartCount
          ? [
              `${input.supplier} ${input.assemblyTitle || "assembly"} extracted ${extracted.length}/${input.expectedGroupPartCount} expected rows.`,
            ]
          : (job.issues as string[]),
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "source_action_bom_complete",
      retrievalState: "parts_partial",
      actualPartCount: mergedRows.length,
      actualCanonicalPartCount: mergedRows.length,
      rawRowCount: mergedRows.length,
      uniqueRowCount: mergedRows.length,
    });

    return;
  }

  if (input.task === "pricing") {
    await setBomJobStage(input.jobId, "source_action_pricing_running");

    const rows = Array.isArray(job.finalRows) ? job.finalRows : [];
    const expected = Number(job.expectedPartsTotal || job.expectedPartCount || 0);

    if (expected > 0 && rows.length < expected) {
      await updateBomJobSummary(input.jobId, {
        jobStage: "source_action_pricing_locked",
        retrievalState: "parts_partial",
        errorText: `Pricing locked. Found ${rows.length}/${expected} expected parts.`,
      });
      return;
    }

    const priced = await enrichBomRowsWithRetailPricing({
      brand: input.brand,
      model: input.canonicalModel,
      rows: rows as any,
      pricingOrder: input.pricingOrder || ["encompass-family", input.supplier, "partsdr"],
    });

    const completion = validate_bom_completion({
      rows: priced.rows as any,
      trustedTotalPartCount: job.trustedTotalPartCount ?? job.expectedPartCount,
      identityResolved: true,
    });

    await saveBomArtifacts(input.jobId, {
      finalRows: priced.rows as any,
      issues: [...(job.issues || []), ...priced.issues],
    });

    await updateBomJobSummary(input.jobId, {
      jobStage: "source_action_pricing_complete",
      retrievalState: completion.retrievalState,
      actualPartCount: completion.actualPartCount,
      actualCanonicalPartCount: completion.actualCanonicalPartCount,
      requiredPriceCount: completion.requiredPriceCount,
      verifiedPriceCount: completion.verifiedPriceCount,
      unpricedCount: completion.unpricedCount,
      bomComplete: completion.bomComplete,
      partsComplete: completion.partsComplete,
      pricingComplete: completion.pricingComplete,
    });

    return;
  }

  throw new Error(`Unsupported source action: ${input.task}`);
}
