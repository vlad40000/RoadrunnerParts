import {
  fetchSourcesFromSpecificProviders,
  resolveSourceProviderPlan,
} from "../../services/source-fetcher";
import { runPartsExtractor } from "../../agents/parts-extractor";
import { runWithConcurrency } from "../../services/providers/utils";
import { mergeMasterParts, type MasterPart } from "./master-parts";

export async function runGapFillAgent(input: {
  brand: string | null;
  model: string | null;
  currentParts: MasterPart[];
  onPartialResult?: (rows: MasterPart[]) => void;
}): Promise<{
  rows: MasterPart[];
  fillCount: number;
  sourcesUsed: string[];
}> {
  const plan = resolveSourceProviderPlan({
    brand: input.brand,
    model: input.model,
  });

  if (!plan.fallbackProviderNames.length) {
    return { rows: input.currentParts, fillCount: 0, sourcesUsed: [] };
  }

  const fallbackSources = await fetchSourcesFromSpecificProviders({
    brand: input.brand,
    model: input.model,
    providerNames: plan.fallbackProviderNames,
  });

  if (fallbackSources.length === 0) {
    return { rows: input.currentParts, fillCount: 0, sourcesUsed: [] };
  }

  const extractedRows = (
    await runWithConcurrency(fallbackSources, 2, async (source) => {
      const rows = await runPartsExtractor({
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        sourceText: source.text,
        modelNumber: input.model || "UNKNOWN",
      });
      if (rows && rows.length > 0 && input.onPartialResult) {
        input.onPartialResult(rows as any[]);
      }
      return rows || [];
    })
  ).flat();

  const initialCount = input.currentParts.length;
  const merged = mergeMasterParts(input.currentParts, extractedRows, "gap-fill");

  return {
    rows: merged,
    fillCount: merged.length - initialCount,
    sourcesUsed: [...new Set(fallbackSources.map((s) => s.provider))],
  };
}
