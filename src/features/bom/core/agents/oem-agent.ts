import {
  fetchSourcesFromSpecificProviders,
  resolveSourceProviderPlan,
} from "../../services/source-fetcher";
import { runPartsExtractor } from "../../agents/parts-extractor";
import { runWithConcurrency } from "../../services/providers/utils";
import { mergeMasterParts, type MasterPart } from "./master-parts";

export async function runOemAgent(input: {
  brand: string | null;
  model: string | null;
  onPartialResult?: (rows: MasterPart[]) => void;
}): Promise<{
  rows: MasterPart[];
  oemCount: number;
  sourcesUsed: string[];
}> {
  const plan = resolveSourceProviderPlan({
    brand: input.brand,
    model: input.model,
  });

  if (!plan.primaryProviderNames.length) {
    return { rows: [], oemCount: 0, sourcesUsed: [] };
  }

  const oemSources = await fetchSourcesFromSpecificProviders({
    brand: input.brand,
    model: input.model,
    providerNames: plan.primaryProviderNames,
  });

  if (oemSources.length === 0) {
    return { rows: [], oemCount: 0, sourcesUsed: [] };
  }

  const extractedRows = (
    await runWithConcurrency(oemSources, 2, async (source) => {
      const result = await runPartsExtractor({
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        sourceText: source.text,
        modelNumber: input.model || "UNKNOWN",
      });
      const rows = result.rows || [];
      if (rows && rows.length > 0 && input.onPartialResult) {
        input.onPartialResult(rows as any[]);
      }
      return rows;
    })
  ).flat();

  const merged = mergeMasterParts([], extractedRows, "oem");

  return {
    rows: merged,
    oemCount: merged.length,
    sourcesUsed: [...new Set(oemSources.map((s) => s.provider))],
  };
}
