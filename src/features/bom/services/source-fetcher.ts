import "server-only";

import {
  getManufacturerFamilyConfig,
  resolveTrueOemBrand,
} from "@/lib/providers/manufacturer/family-config";

import type { RetrievedSource, SourceProvider } from "./providers/types";
import { repairClinicFamilyProvider } from "./providers/repairclinic-family";
import { searsPartsDirectProvider } from "./providers/sears-partsdirect";
import { fixComDiagramsProvider } from "./providers/fix-com";
import { appliancePartsProsProvider } from "./providers/appliancepartspros";
import { normalizeCanonicalModel as normalizeModel } from "../services/source-tier-policy";
import { runWithConcurrency, uniqueBy, withDeadline } from "./providers/utils";
import { encompassFamilyProvider } from "./providers/encompass-family";

const ALL_PROVIDERS: SourceProvider[] = [
  repairClinicFamilyProvider,
  searsPartsDirectProvider,
  fixComDiagramsProvider,
  appliancePartsProsProvider,
  encompassFamilyProvider,
];

const PROVIDER_BY_NAME = new Map<string, SourceProvider>(
  ALL_PROVIDERS.map((provider) => [provider.name, provider]),
);

const FAMILY_FALLBACK_PROVIDER_NAMES: Record<string, string[]> = {
};

const ADAPTER_TO_PROVIDER_NAMES: Record<string, string[]> = {
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
    .map((name) => PROVIDER_BY_NAME.get(name) ?? null)
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

  const providers: SourceProvider[] = [
    repairClinicFamilyProvider,
    searsPartsDirectProvider,
    fixComDiagramsProvider,
    appliancePartsProsProvider,
    encompassFamilyProvider,
  ].filter((p) => p.supports({ brand, model }));

  const deadlineMs = parseInt(process.env.BOM_PROVIDER_DEADLINE_MS || "12000", 10);

  const results = await Promise.allSettled(
    providers.map((p) =>
      withDeadline(p.fetchSources({ brand, model, productType: input.productType ?? null } as any), deadlineMs, p.name)
    )
  );

  const allSources: RetrievedSource[] = [];

  results.forEach((res, idx) => {
    const providerName = providers[idx].name;
    if (res.status === "fulfilled") {
      allSources.push(...res.value);
    } else {
      console.error(`Provider ${providerName} failed or timed out:`, res.reason);
    }
  });

  return uniqueBy(allSources, (s) => `${s.provider}:${s.sourceUrl}`);
}
