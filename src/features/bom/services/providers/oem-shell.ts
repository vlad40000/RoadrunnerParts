import "server-only";

import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { cleanText, normalizeBrand, normalizeModel } from "./utils";

type OemShellConfig = {
  name: string;
  familyLabel: string;
  brandNames: string[];
  homepage: string;
  priority?: number;
};

function buildShellText(input: {
  providerName: string;
  familyLabel: string;
  model: string;
  homepage: string;
}) {
  return [
    `SOURCE_PROVIDER: ${input.providerName}`,
    `MODEL: ${input.model}`,
    `SECTION: OEM Adapter Shell`,
    `ADAPTER_STATUS: not_implemented`,
    `OEM_FAMILY: ${input.familyLabel}`,
    `NO_PART_ROWS: true`,
    `ROW_COUNT: 0`,
    `HOMEPAGE: ${input.homepage}`,
    `NOTE: Deterministic OEM family slot exists, but no real manufacturer scraper is implemented yet.`,
  ].join("\n");
}

export function createUnimplementedOemShellProvider(
  config: OemShellConfig,
): SourceProvider {
  const acceptedBrands = new Set(
    config.brandNames.map((brand) => normalizeBrand(brand)),
  );

  return {
    name: config.name,
    priority: config.priority ?? 30,

    supports(input: ProviderInput) {
      const model = normalizeModel(input.model);
      if (!model) return false;

      const brand = normalizeBrand(input.brand);
      if (!brand) return false;

      return acceptedBrands.has(brand);
    },

    async fetchSources(input: ProviderInput): Promise<RetrievedSource[]> {
      const model = normalizeModel(input.model);
      if (!model) return [];

      return [
        {
          sourceUrl: config.homepage,
          sourceType: "oem",
          provider: config.name,
          sectionName: "OEM Adapter Shell",
          text: buildShellText({
            providerName: config.name,
            familyLabel: cleanText(config.familyLabel),
            model,
            homepage: config.homepage,
          }),
          meta: {
            rowCount: 0,
            adapterStatus: "not_implemented",
            oemFamily: config.familyLabel,
            attemptedModel: model,
            shellProvider: true,
          },
        },
      ];
    },
  };
}
