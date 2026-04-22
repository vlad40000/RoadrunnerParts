import 'server-only';
import { fetchPartsList } from '@/lib/gemini';
import { mapStructuredRowsToRaw } from '@/lib/providers/manufacturer/generic-family';

/**
 * Dedicated Sears PartsDirect Distributor Adapter.
 * Used as high-fidelity gap-fill for model-assisted BOM retrieval.
 */
export async function fetchSearsDistributorBom({ modelNumber, brand, plan = {} }) {
  const providerPlan = {
    modelNumber: modelNumber,
    brand: brand,
    manufacturerDomains: [],
    distributorFallbacks: ['searspartsdirect.com'],
    allowedDomains: ['searspartsdirect.com'],
    truthOrder: ['searspartsdirect.com'],
    truthSource: 'Sears PartsDirect distributor catalog',
    strategy: 'distributor-sears-adapter',
  };

  console.log(`[Adapter Sears] Executing gap-fill for ${modelNumber}`);
  const result = await fetchPartsList(modelNumber, providerPlan);
  
  const parts = mapStructuredRowsToRaw(result.parts || [], 'searspartsdirect.com');
  const sections = new Set(parts.map((row) => row.sectionName).filter(Boolean));
  const flags = [];
  if (parts.length === 0) flags.push('distributor-no-parts');

  return {
    truthSource: 'Sears PartsDirect distributor catalog',
    sourceStrategy: 'distributor-sears-adapter',
    modelUrl: (result.sources && result.sources[0]) ? result.sources[0].uri : null,
    summary: result.summary || `Sears PartsDirect BOM for ${modelNumber}.`,
    source: 'searspartsdirect.com',
    parts: parts,
    sources: result.sources || [],
    coverage: {
      provider: 'sears-distributor',
      sectionsDiscovered: sections.size,
      sectionsFetched: sections.size,
      sectionFetchFailures: 0,
      paginationComplete: false,
      flags: flags,
    },
    planMeta: {
      truthOrder: plan.truthOrder || [],
      fallbackSources: plan.distributorFallbacks || ['searspartsdirect.com'],
    },
  };
}
