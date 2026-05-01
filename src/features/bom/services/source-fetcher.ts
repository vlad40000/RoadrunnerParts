import "server-only";

import {
  getManufacturerFamilyConfig,
  resolveTrueOemBrand,
} from "@/lib/providers/manufacturer/family-config";
import {
  resolveBrandSourceGate,
  type SourceKey,
} from "../registry/brand-source-gate";

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
import { appliancePartsProsProvider } from "./providers/appliancepartspros";
import { partsDrProvider } from "./providers/partsdr";

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
  appliancePartsProsProvider,
  partsDrProvider,
];

const PROVIDER_BY_NAME: Record<string, SourceProvider> = Object.fromEntries(
  ALL_PROVIDERS.map((p) => [p.name, p])
);

const DISTRIBUTOR_PRIMARY_PROVIDERS = [
  "encompass-family",
  "sears-partsdirect",
  "partsdr",
];

const DISTRIBUTOR_SECONDARY_PROVIDERS = [
  "appliancepartspros",
  "partselect.com",
  "fix.com",
  "repairclinic-family",
];

const UNIVERSAL_FALLBACK_PROVIDER_NAMES = [
  ...DISTRIBUTOR_PRIMARY_PROVIDERS,
  ...DISTRIBUTOR_SECONDARY_PROVIDERS,
];

/**
 * Mapping of manufacturer adapter keys to their authoritative provider names.
 */
const ADAPTER_TO_PROVIDER_NAMES: Record<string, string[]> = {
  "ge-official": ["ge-official"],
  "whirlpool-family": ["encompass-family", "sears-partsdirect", "partsdr", "appliancepartspros"],
  "frigidaire-family": ["partsdr", "partselect.com", "sears-partsdirect", "encompass-family", "fix.com"],
  "lg-family": ["lg-family", "encompass-family"],
  "samsung-family": ["samsung-family", "encompass-family"],
  "bosch-family": ["bosch-family"],
  "distributor-pass": [...DISTRIBUTOR_PRIMARY_PROVIDERS, ...DISTRIBUTOR_SECONDARY_PROVIDERS],
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
  return Array.from(new Set(values.filter(Boolean) as string[]));
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

function filterProvidersByBrandGate(
  providers: SourceProvider[],
  input: { brand: string | null; model: string | null },
) {
  const resolvedBrand = input.model
    ? resolveTrueOemBrand(input.brand, input.model)
    : input.brand;
  const gate = resolveBrandSourceGate({
    brand: input.brand,
    resolvedBrand,
  });
  const approved = new Set(gate.approvedSources);

  return providers.filter((provider) =>
    approved.has(provider.name as SourceKey),
  );
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

  // 1. Distributor Primary (Encompass, Sears, PartsDr)
  const primaryDistributors = [
    encompassFamilyProvider,
    searsPartsDirectProvider,
    partsDrProvider,
  ];
  const primarySources = await runProviders(
    filterProvidersByBrandGate(primaryDistributors, { brand, model }),
    providerInput,
  );
  if (primarySources.length > 0) {
    return uniqueBy(primarySources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 2. Distributor Secondary (APP, PartSelect, Fix, RepairClinic)
  const secondaryDistributors = [
    appliancePartsProsProvider,
    partSelectProvider,
    fixComProvider,
    repairClinicFamilyProvider,
  ];
  const secondarySources = await runProviders(
    filterProvidersByBrandGate(secondaryDistributors, { brand, model }),
    providerInput,
  );
  if (secondarySources.length > 0) {
    return uniqueBy(secondarySources, (s) => `${s.provider}:${s.sourceUrl}`);
  }

  // 3. OEM Official Providers (Only if explicitly enabled)
  const OEM_ENABLED = process.env.BOM_ENABLE_OEM_SOURCES === "true";
  if (OEM_ENABLED) {
    const oemProviders = [
      geOfficialProvider,
      boschFamilyProvider,
      lgFamilyProvider,
      samsungFamilyProvider,
      frigidaireFamilyProvider,
    ];
    const oemSources = await runProviders(
      filterProvidersByBrandGate(oemProviders, { brand, model }),
      providerInput,
    );
    if (oemSources.length > 0) {
      return uniqueBy(oemSources, (s) => `${s.provider}:${s.sourceUrl}`);
    }
  }

  return [];
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
