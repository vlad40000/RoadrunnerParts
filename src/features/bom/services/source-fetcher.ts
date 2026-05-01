import "server-only";

import {
  getManufacturerFamilyConfig,
  resolveTrueOemBrand,
} from "@/lib/providers/manufacturer/family-config";

import type { RetrievedSource, SourceProvider } from "./providers/types";
import { repairClinicFamilyProvider } from "./providers/repairclinic-family";
import { searsPartsDirectProvider } from "./providers/sears-partsdirect";
import { fixComProvider } from "./providers/fix-com";
import { encompassFamilyProvider } from "./providers/encompass-family";
import { partSelectProvider } from "./providers/partselect";
import { geOfficialProvider } from "./providers/ge-official";
import { boschFamilyProvider } from "./providers/bosch-family";
import { frigidaireFamilyProvider } from "./providers/frigidaire-family";
import { lgFamilyProvider } from "./providers/lg-family";
import { samsungFamilyProvider } from "./providers/samsung-family";
import { normalizeModel, runWithConcurrency, uniqueBy } from "./providers/utils";
import { seededProvider } from "./providers/seeded-provider";

const ALL_PROVIDERS: SourceProvider[] = [
  seededProvider,
  fixComProvider,
  searsPartsDirectProvider,
  repairClinicFamilyProvider,
  encompassFamilyProvider,
  partSelectProvider,
  geOfficialProvider,
  boschFamilyProvider,
  frigidaireFamilyProvider,
  lgFamilyProvider,
  samsungFamilyProvider,
];

const PROVIDER_BY_NAME: Record<string, SourceProvider> = Object.fromEntries(
  ALL_PROVIDERS.map((p) => [p.name, p])
);

const UNIVERSAL_FALLBACK_PROVIDER_NAMES = [
  "fix.com",
  "sears-partsdirect",
  "repairclinic-family",
  "encompass-family",
  "partselect.com",
] as const;

const FAMILY_FALLBACK_PROVIDER_NAMES: Record<string, string[]> = {
  "whirlpool-family": ["fix.com", "repairclinic-family", "sears-partsdirect", "partselect.com"],
};

/**
 * Mapping of manufacturer adapter keys (from family-config.js) to their 
 * authoritative provider names.
 */
const ADAPTER_TO_PROVIDER_NAMES: Record<string, string[]> = {
  "ge-official": ["ge-official"],
  "whirlpool-family": ["repairclinic-family"],
  "frigidaire-family": ["frigidaire-family"],
  "lg-family": ["lg-family"],
  "samsung-family": ["samsung-family"],
  "bosch-family": ["bosch-family"],
  "distributor-pass": ["fix.com", "sears-partsdirect", "encompass-family", "partselect.com"],
};

export type SourceProviderPlan = {
  inputBrand: string | null;
  resolvedBrand: string | null;
  familyKey: string | null;
  adapterKey: string | null;
  routingMode: "oem-first" | "distributor-first";
  primaryProviderNames: string[];
  fallbackProviderNames: string[];
};

function dedupeStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function filterByTargetSections(
  sources: RetrievedSource[],
  targetSections?: string[],
) {
  if (!targetSections?.length) return sources;

  const wanted = new Set(
    targetSections.map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  return sources.filter((source) => {
    const section = (source.sectionName ?? "").trim().toLowerCase();
    if (!section) return false;
    return wanted.has(section);
  });
}

function selectProviders(providerNames: string[]) {
  return providerNames
    .map((name) => PROVIDER_BY_NAME[name] ?? null)
    .filter(Boolean) as SourceProvider[];
}

async function runProviders(
  providers: SourceProvider[],
  input: {
    brand: string | null;
    model: string | null;
    productType?: string | null;
  },
) {
  const model = normalizeModel(input.model);
  if (!model) return [];

  const eligible = providers
    .filter((provider) =>
      provider.supports({
        brand: input.brand,
        model,
      }),
    )
    .sort((a, b) => a.priority - b.priority);

  const merged: RetrievedSource[] = [];
  const providerConcurrency = Math.max(
    1,
    Number.parseInt(process.env.BOM_PROVIDER_CONCURRENCY ?? "3", 10) || 3,
  );

  const providerResults = await runWithConcurrency(
    eligible,
    providerConcurrency,
    async (provider) => {
      try {
        return await provider.fetchSources({
          brand: input.brand,
          model,
          productType: input.productType ?? null,
        } as any);
      } catch {
        return [];
      }
    },
  );

  for (const sources of providerResults) {
    if (sources.length) {
      merged.push(...sources);
    }
  }

  return uniqueBy(merged, (s) => `${s.provider}|${s.sectionName}|${s.sourceUrl}`);
}

export function resolveSourceProviderPlan(input: {
  brand: string | null;
  model: string | null;
}): SourceProviderPlan {
  const model = normalizeModel(input.model);
  const inputBrand = input.brand ?? null;

  const resolvedBrand = model
    ? resolveTrueOemBrand(input.brand, model)
    : input.brand ?? null;

  const family = resolvedBrand
    ? getManufacturerFamilyConfig(resolvedBrand, model ?? "")
    : null;

  const primaryProviderNames = family?.adapterKey
    ? ADAPTER_TO_PROVIDER_NAMES[family.adapterKey] ?? []
    : [];

  const fallbackProviderNames = dedupeStrings([
    ...(family?.key
      ? FAMILY_FALLBACK_PROVIDER_NAMES[family.key] ?? []
      : []),
    ...UNIVERSAL_FALLBACK_PROVIDER_NAMES,
  ]);

  return {
    inputBrand,
    resolvedBrand,
    familyKey: family?.key ?? null,
    adapterKey: family?.adapterKey ?? null,
    routingMode:
      primaryProviderNames.length > 0 ? "oem-first" : "distributor-first",
    primaryProviderNames,
    fallbackProviderNames,
  };
}

export async function fetchSourcesFromSpecificProviders(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
  providerNames: string[];
  targetSections?: string[];
}): Promise<RetrievedSource[]> {
  const model = normalizeModel(input.model);
  if (!model) return [];

  const resolvedBrand = resolveTrueOemBrand(input.brand, model);
  const selected = selectProviders(input.providerNames);

  const merged = await runProviders(selected, {
    brand: resolvedBrand ?? input.brand,
    model,
    productType: input.productType ?? null,
  });

  return uniqueBy(
    filterByTargetSections(merged, input.targetSections),
    (s) => `${s.provider}|${s.sectionName}|${s.sourceUrl}`,
  );
}

export async function fetchAuthoritativeSources(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
}): Promise<RetrievedSource[]> {
  const brand = input.brand || "";
  const model = input.model || "";

  const providerInput = {
    brand,
    model,
    productType: input.productType ?? null,
  };

  // 0. Seeded Provider (Top Priority)
  const seededSources = await runProviders([seededProvider], providerInput);
  if (seededSources.length > 0) {
    return uniqueBy(seededSources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 1. Co-primary diagram/catalog sources: Sears PartsDirect + Fix.com.
  // Run both before falling through so a weak hit from one provider does not
  // suppress useful diagram/count evidence from the other.
  const coPrimarySources = await runProviders(
    [searsPartsDirectProvider, fixComProvider],
    providerInput,
  );
  if (coPrimarySources.length > 0) {
    return uniqueBy(coPrimarySources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 2. PartSelect (Viability Rank #2)
  const partSelectSources = await runProviders([partSelectProvider], providerInput);
  if (partSelectSources.length > 0) {
    return uniqueBy(partSelectSources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 3. specialized families like RepairClinic
  const familySources = await runProviders([repairClinicFamilyProvider], providerInput);
  if (familySources.length > 0) {
    return uniqueBy(familySources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 4. General distributors
  const encompassSources = await runProviders([encompassFamilyProvider], providerInput);
  return uniqueBy(encompassSources, (s) => `${s.provider}:${s.sourceUrl}`);
}

/**
 * Backward-compatible alias used by older orchestrator imports.
 */
export async function fetchSources(input: {
  brand: string | null;
  model: string | null;
  productType?: string | null;
}) {
  return fetchAuthoritativeSources(input);
}
