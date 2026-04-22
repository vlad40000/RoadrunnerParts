import 'server-only';
import { fetchPartsList } from '@/lib/gemini';
import { mapStructuredRowsToRaw } from '@/lib/providers/manufacturer/generic-family';

const DEFAULT_DISTRIBUTOR_DOMAINS = [
  'searspartsdirect.com',
  'partselect.com',
  'repairclinic.com',
  'reliableparts.com',
  'dlpartsco.com',
];

function uniqueDomains(domains = []) {
  return [...new Set((domains || []).filter(Boolean))];
}

function buildSingleDomainPlan(plan = {}, domain, brand) {
  return {
    ...plan,
    brand,
    manufacturerDomains: [],
    distributorFallbacks: [domain],
    gapFillDomains: [domain],
    allowedDomains: [domain],
    truthOrder: [domain],
    truthSource: `${domain} distributor catalog`,
    strategy: `gap-fill:${domain}`,
  };
}

async function fetchSingleDomainGapFill({ modelNumber, brand, plan, domain }) {
  const domainPlan = buildSingleDomainPlan(plan, domain, brand);
  const result = await fetchPartsList(modelNumber, domainPlan);
  const parts = mapStructuredRowsToRaw(result.parts || [], domain);
  const sections = new Set(parts.map((row) => row.sectionName).filter(Boolean));

  return {
    summary: result.summary || `${domain} BOM for ${modelNumber}.`,
    source: domain,
    truthSource: `${domain} distributor catalog`,
    sourceStrategy: `gap-fill:${domain}`,
    sources: result.sources || [],
    parts,
    coverage: {
      provider: domain,
      sectionsDiscovered: sections.size,
      sectionsFetched: sections.size,
      sectionFetchFailures: 0,
      paginationComplete: false,
      flags: parts.length > 0 ? [] : ['distributor-no-parts'],
    },
  };
}

export async function fetchGapFillBom({ modelNumber, brand, plan = {}, domains = null }) {
  const targetDomains = uniqueDomains(domains || plan.gapFillDomains || DEFAULT_DISTRIBUTOR_DOMAINS);

  if (targetDomains.length === 0) {
    return {
      summary: '',
      truthSource: 'No distributor fallback executed',
      sourceStrategy: 'no-gap-fill',
      source: 'none',
      parts: [],
      sources: [],
      sourceBreakdown: {},
      coverage: {
        provider: 'none',
        sectionsDiscovered: 0,
        sectionsFetched: 0,
        sectionFetchFailures: 0,
        paginationComplete: false,
        flags: [],
      },
    };
  }

  const distributorFallbacks = targetDomains.filter(Boolean);

  const results = await Promise.all(
    distributorFallbacks.map(async (domain) => {
      try {
        return await fetchSingleDomainGapFill({ modelNumber, brand, plan, domain });
      } catch (error) {
        console.error(`[Gap Fill Error] ${domain}`, error);
        return {
          summary: '',
          source: domain,
          truthSource: `${domain} distributor catalog`,
          sourceStrategy: `gap-fill:${domain}`,
          sources: [],
          parts: [],
          coverage: {
            provider: domain,
            sectionsDiscovered: 0,
            sectionsFetched: 0,
            sectionFetchFailures: 1,
            paginationComplete: false,
            flags: ['distributor-fetch-failed'],
          },
        };
      }
    })
  );

  const allParts = results.flatMap((result) => result.parts || []);
  const allSources = [];
  const seenSourceUris = new Set();
  for (const result of results) {
    for (const source of result.sources || []) {
      const key = source?.uri || source?.title;
      if (!key || seenSourceUris.has(key)) continue;
      seenSourceUris.add(key);
      allSources.push(source);
    }
  }

  const sourceBreakdown = Object.fromEntries(
    results.map((result) => [result.source, (result.parts || []).length])
  );

  return {
    summary: results.find((result) => result.summary)?.summary || '',
    truthSource: 'Multi-source distributor gap-fill',
    sourceStrategy: 'multi-domain-gap-fill',
    source: 'multi-distributor',
    parts: allParts,
    sources: allSources,
    sourceBreakdown,
    coverage: {
      provider: 'multi-distributor',
      sectionsDiscovered: results.reduce((sum, result) => sum + (result.coverage?.sectionsDiscovered || 0), 0),
      sectionsFetched: results.reduce((sum, result) => sum + (result.coverage?.sectionsFetched || 0), 0),
      sectionFetchFailures: results.reduce((sum, result) => sum + (result.coverage?.sectionFetchFailures || 0), 0),
      paginationComplete: false,
      flags: results.flatMap((result) => result.coverage?.flags || []),
    },
  };
}
