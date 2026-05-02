import "server-only";
import { resolveSourceProviderPlan, fetchSourcesFromSpecificProviders } from "../../services/source-fetcher";
import { logger } from "@/lib/logger";
import type { RetrievedSource } from "../../services/providers/types";

export type DistributorSourceAgentOutput = {
  status: "distributor_sources_complete" | "failed";
  sources: RetrievedSource[];
  distributorCoverage: number;
  providerResults: Array<{
    provider: string;
    count: number;
    status: "success" | "empty" | "error";
  }>;
};

export async function runDistributorSourceAgent(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
}): Promise<DistributorSourceAgentOutput> {
  const brand = input.brand || "";
  const model = input.model || "";

  logger.info(`[DistributorSourceAgent] Starting retrieval for ${brand} ${model}`);

  const plan = resolveSourceProviderPlan({ brand, model });
  const providersToTry = plan.primaryProviderNames;

  if (providersToTry.length === 0) {
    logger.warn(`[DistributorSourceAgent] No primary providers found for ${brand} ${model}`);
    return {
      status: "failed",
      sources: [],
      distributorCoverage: 0,
      providerResults: []
    };
  }

  const results = await fetchSourcesFromSpecificProviders({
    brand,
    model,
    productType: input.productType,
    providerNames: providersToTry
  });

  const providerMetrics = providersToTry.map(name => {
    const providerSources = results.filter(s => s.provider === name);
    return {
      provider: name,
      count: providerSources.length,
      status: (providerSources.length > 0 ? "success" : "empty") as "success" | "empty" | "error"
    };
  });

  const successCount = providerMetrics.filter(m => m.status === "success").length;
  const distributorCoverage = successCount / providersToTry.length;

  // Tag rows with source: "distributor" implicitly via the RetrievedSource structure
  // but the orchestrator handles the conversion to BomRow.

  return {
    status: "distributor_sources_complete",
    sources: results,
    distributorCoverage,
    providerResults: providerMetrics
  };
}
