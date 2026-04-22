import "server-only";

import { resolveSourceProviderPlan } from "../services/source-fetcher";

type RetrievedSourceLike = {
  provider?: string;
  sourceUrl?: string;
  sectionName?: string;
};

type BomRowLike = {
  section?: string;
  sourceUrl?: string;
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSection(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

function providerGroup(provider: string | null | undefined) {
  const p = cleanText(provider);
  if (!p) return "";
  if (p.startsWith("repairclinic-")) return "repairclinic-family";
  return p;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export type RecoveryPlan = {
  shouldRecover: boolean;
  targetSections: string[];
  weakProviders: string[];
  familyPrimaryProviders: string[];
  distributorFallbackProviders: string[];
  reasons: string[];
};

export function buildRecoveryPlan(input: {
  brand: string | null;
  model: string | null;
  diagramParse: {
    sections?: Array<{
      sectionName?: string;
      callouts?: Array<string | number>;
    }>;
  } | null;
  retrievedSources: RetrievedSourceLike[];
  finalRows: BomRowLike[];
  uniqueRowCount: number;
  minimumUniqueParts?: number;
}): RecoveryPlan {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;

  const expectedSections = unique(
    (input.diagramParse?.sections ?? [])
      .map((s) => normalizeSection(s.sectionName))
      .filter(Boolean),
  );

  const presentSections = unique(
    input.finalRows.map((row) => normalizeSection(row.section)).filter(Boolean),
  );

  const missingSections = expectedSections.filter(
    (section) => !presentSections.includes(section),
  );

  const sourceUrlToProvider = new Map<string, string>();
  for (const source of input.retrievedSources) {
    const url = cleanText(source.sourceUrl);
    const provider = providerGroup(source.provider);
    if (!url || !provider) continue;
    sourceUrlToProvider.set(url, provider);
  }

  const providerSourceCounts = new Map<string, number>();
  for (const source of input.retrievedSources) {
    const provider = providerGroup(source.provider);
    if (!provider) continue;
    providerSourceCounts.set(provider, (providerSourceCounts.get(provider) ?? 0) + 1);
  }

  const providerRowCounts = new Map<string, number>();
  for (const row of input.finalRows) {
    const url = cleanText(row.sourceUrl);
    const provider = sourceUrlToProvider.get(url);
    if (!provider) continue;
    providerRowCounts.set(provider, (providerRowCounts.get(provider) ?? 0) + 1);
  }

  const weakProviders = [...providerSourceCounts.keys()].filter(
    (provider) => (providerRowCounts.get(provider) ?? 0) === 0,
  );

  const providerPlan = resolveSourceProviderPlan({
    brand: input.brand,
    model: input.model,
  });

  const isDistributorFirstFamily =
    providerPlan.routingMode === "distributor-first";

  const reasons: string[] = [];


  const familyPrimaryProviders = unique(
    (providerPlan.primaryProviderNames ?? [])
      .map((provider) => providerGroup(provider))
      .filter(Boolean),
  );

  const distributorFallbackProviders = unique(
    (providerPlan.fallbackProviderNames ?? [])
      .map((provider) => providerGroup(provider))
      .filter(Boolean),
  );

  const familyPrimaryWeakProviders = familyPrimaryProviders.filter(
    (provider) =>
      (providerSourceCounts.get(provider) ?? 0) > 0 &&
      (providerRowCounts.get(provider) ?? 0) === 0,
  );

  const uniquePartCountFromRows = new Set(
    input.finalRows.map((p) => {
      // Use any available part number property since it's a 'Like' type
      const row = p as any;
      return (row.currentServicePartNumber || row.originalPartNumber || row.partNumber || "").toUpperCase().trim();
    }).filter(Boolean)
  ).size;

  const needsSectionRecovery = missingSections.length > 0;
  const needsVolumeRecovery = uniquePartCountFromRows < minimumUniqueParts;
  const needsFamilyRetry = familyPrimaryWeakProviders.length > 0;

  if (needsFamilyRetry) {
    reasons.push("Primary OEM family sources were fetched but produced zero accepted rows.");
  }

  if (needsSectionRecovery) {
    reasons.push("One or more expected sections are still missing.");
  }

  if (needsVolumeRecovery) {
    reasons.push("Part count is still below the target threshold.");
  }

  const shouldTryFamilyFirst =
    familyPrimaryProviders.length > 0 &&
    (needsFamilyRetry || needsSectionRecovery || needsVolumeRecovery);

  const shouldUseDistributorFallback =
    distributorFallbackProviders.length > 0 &&
    (needsSectionRecovery || needsVolumeRecovery || needsFamilyRetry);

  return {
    shouldRecover: shouldTryFamilyFirst || shouldUseDistributorFallback,
    targetSections: missingSections,
    weakProviders,
    familyPrimaryProviders: shouldTryFamilyFirst ? familyPrimaryProviders : [],
    distributorFallbackProviders: shouldUseDistributorFallback
      ? distributorFallbackProviders
      : [],
    reasons,
  };
}
