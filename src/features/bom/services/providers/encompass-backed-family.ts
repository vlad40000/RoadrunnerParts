import "server-only";

import { load } from "cheerio";
import type {
  ProviderInput,
  RetrievedSource,
  SourceProvider,
} from "./types";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";

export type EncompassVariationLink = {
  url: string;
  variationCode: string | null;
};

export type EncompassParsedRow = {
  sectionName: string;
  partNumber: string;
  description: string;
  nlaStatus: boolean;
  replacementNote?: string | null;
  diagramNumber?: string | null;
  originalPartNumber?: string | null;
  currentServicePartNumber?: string | null;
};

type CreateEncompassBackedFamilyProviderConfig = {
  name: string;
  priority?: number;
  domain: string;
  brandNames: string[];
  replacementNoteDefault?: string;
  sourceSurfaceLabel?: string;
  buildPreferredQueries(model: string): string[];
  looksLikeModelUrl(url: string): boolean;
  isVariationUrl(url: string): boolean;
  extractVariationCodeFromUrl(url: string): string | null;
  landingHasMultipleVariations(text: string): boolean;
  landingHasPartsList(text: string): boolean;
  pageContainsTargetModel?(text: string, model: string): boolean;
  parseVariationLinks(input: {
    modelUrl: string;
    html: string;
    model: string;
  }): EncompassVariationLink[];
  parseRows(input: {
    html: string;
    text: string;
    model: string;
    variationUrl: string;
    variationCode: string | null;
  }): EncompassParsedRow[];
  formatSectionName?(
    rawSectionName: string,
    variationCode: string | null,
  ): string;
};

function baseModel(model: string) {
  return normalizeModel(model).split("/")[0] ?? normalizeModel(model);
}

function defaultPageContainsTargetModel(text: string, model: string) {
  const upper = cleanText(text).toUpperCase();
  const full = normalizeModel(model);
  const base = baseModel(model);

  return upper.includes(full) || upper.includes(base);
}

function defaultFormatSectionName(
  rawSectionName: string,
  variationCode: string | null,
) {
  const section = cleanText(rawSectionName) || "Miscellaneous";
  return variationCode ? `${section} [${variationCode}]` : section;
}

function groupRows(
  rows: EncompassParsedRow[],
  variationCode: string | null,
  formatSectionName: (
    rawSectionName: string,
    variationCode: string | null,
  ) => string,
) {
  const map = new Map<string, EncompassParsedRow[]>();

  for (const row of rows) {
    const rawSectionName = cleanText(row.sectionName) || "Miscellaneous";
    const sectionName = formatSectionName(rawSectionName, variationCode);

    if (!map.has(sectionName)) {
      map.set(sectionName, []);
    }

    map.get(sectionName)!.push(row);
  }

  return [...map.entries()].map(([sectionName, groupedRows]) => ({
    sectionName,
    rows: uniqueBy(
      groupedRows,
      (row) =>
        `${sectionName}|${row.partNumber}|${row.diagramNumber ?? ""}|${row.description}`,
    ),
  }));
}

function rowsToStructuredText(input: {
  providerName: string;
  model: string;
  sectionName: string;
  rows: EncompassParsedRow[];
  replacementNoteDefault?: string;
}) {
  const lines = [
    `SOURCE_PROVIDER: ${input.providerName}`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
  ];

  for (const row of input.rows) {
    lines.push(
      [
        "ROW",
        `diagram_number=${row.diagramNumber ?? row.partNumber}`,
        `description=${row.description}`,
        `original_part_number=${row.originalPartNumber ?? row.partNumber}`,
        `current_service_part_number=${row.currentServicePartNumber ?? row.partNumber}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? input.replacementNoteDefault ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

async function fetchVariationSources(input: {
  providerName: string;
  sourceSurfaceLabel?: string;
  model: string;
  variationUrl: string;
  variationCode: string | null;
  replacementNoteDefault?: string;
  pageContainsTargetModel: (text: string, model: string) => boolean;
  parseRows: CreateEncompassBackedFamilyProviderConfig["parseRows"];
  formatSectionName: (
    rawSectionName: string,
    variationCode: string | null,
  ) => string;
}): Promise<RetrievedSource[]> {
  const html = await fetchHtml(input.variationUrl);
  const text = htmlToText(html);

  if (!input.pageContainsTargetModel(text, input.model)) {
    return [];
  }

  const rows = input.parseRows({
    html,
    text,
    model: input.model,
    variationUrl: input.variationUrl,
    variationCode: input.variationCode,
  });

  if (!rows.length) {
    return [];
  }

  return groupRows(rows, input.variationCode, input.formatSectionName).map(
    (group) => ({
      sourceUrl: input.variationUrl,
      sourceType: "oem" as const,
      provider: input.providerName,
      sectionName: group.sectionName,
      text: rowsToStructuredText({
        providerName: input.providerName,
        model: input.model,
        sectionName: group.sectionName,
        rows: group.rows,
        replacementNoteDefault: input.replacementNoteDefault,
      }),
      meta: {
        rowCount: group.rows.length,
        variationCode: input.variationCode,
        sourceSurface:
          input.sourceSurfaceLabel ?? `${input.providerName}-encompass`,
      },
    }),
  );
}

export function createEncompassBackedFamilyProvider(
  config: CreateEncompassBackedFamilyProviderConfig,
): SourceProvider & CreateEncompassBackedFamilyProviderConfig {
  const acceptedBrands = new Set(
    config.brandNames.map((brand) => normalizeBrand(brand)),
  );

  const pageContainsTargetModel =
    config.pageContainsTargetModel ?? defaultPageContainsTargetModel;

  const formatSectionName =
    config.formatSectionName ?? defaultFormatSectionName;

  return {
    ...config,
    name: config.name,
    priority: config.priority ?? 20,

    supports(input: ProviderInput) {
      const model = normalizeModel(input.model);
      if (!model) return false;

      const brand = normalizeBrand(input.brand);
      return !brand || acceptedBrands.has(brand);
    },

    async fetchSources(input: ProviderInput) {
      const model = normalizeModel(input.model);
      if (!model) return [];

      const resolution = await resolveExactModelUrl({
        model,
        domain: config.domain,
        preferredQueries: config.buildPreferredQueries(model),
      });

      if (!resolution?.url || !config.looksLikeModelUrl(resolution.url)) {
        return [];
      }

      const resolvedUrl = resolution.url;

      if (config.isVariationUrl(resolvedUrl)) {
        return fetchVariationSources({
          providerName: config.name,
          sourceSurfaceLabel: config.sourceSurfaceLabel,
          model,
          variationUrl: resolvedUrl,
          variationCode: config.extractVariationCodeFromUrl(resolvedUrl),
          replacementNoteDefault: config.replacementNoteDefault,
          pageContainsTargetModel,
          parseRows: config.parseRows,
          formatSectionName,
        });
      }

      const landingHtml = await fetchHtml(resolvedUrl);
      const landingText = htmlToText(landingHtml);

      if (!pageContainsTargetModel(landingText, model)) {
        return [];
      }

      if (!config.landingHasMultipleVariations(landingText)) {
        if (config.landingHasPartsList(landingText)) {
          return fetchVariationSources({
            providerName: config.name,
            sourceSurfaceLabel: config.sourceSurfaceLabel,
            model,
            variationUrl: resolvedUrl,
            variationCode: config.extractVariationCodeFromUrl(resolvedUrl),
            replacementNoteDefault: config.replacementNoteDefault,
            pageContainsTargetModel,
            parseRows: config.parseRows,
            formatSectionName,
          });
        }

        return [];
      }

      const variationLinks = config.parseVariationLinks({
        modelUrl: resolvedUrl,
        html: landingHtml,
        model,
      });

      if (!variationLinks.length) {
        return [];
      }

      const sources: RetrievedSource[] = [];

      for (const variation of variationLinks.slice(0, 12)) {
        try {
          const rows = await fetchVariationSources({
            providerName: config.name,
            sourceSurfaceLabel: config.sourceSurfaceLabel,
            model,
            variationUrl: variation.url,
            variationCode: variation.variationCode,
            replacementNoteDefault: config.replacementNoteDefault,
            pageContainsTargetModel,
            parseRows: config.parseRows,
            formatSectionName,
          });

          if (rows.length) {
            sources.push(...rows);
          }
        } catch {
          // continue
        }
      }

      return uniqueBy(
        sources,
        (source) =>
          `${source.provider}|${source.sectionName}|${source.sourceUrl}`,
      );
    },
  };
}

export function defaultParseVariationLinks(input: {
  modelUrl: string;
  html: string;
  model: string;
  looksLikeModelUrl: (url: string) => boolean;
  isVariationUrl: (url: string) => boolean;
  extractVariationCodeFromUrl: (url: string) => string | null;
}) {
  const $ = load(input.html);
  const model = normalizeModel(input.model);

  const links = $("a")
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href || !text) return null;

      const abs = absoluteUrl(input.modelUrl, href);

      if (!input.looksLikeModelUrl(abs)) return null;
      if (!input.isVariationUrl(abs)) return null;
      if (!text.toUpperCase().includes(model)) return null;

      return {
        url: abs,
        variationCode: input.extractVariationCodeFromUrl(abs),
      };
    })
    .get()
    .filter(Boolean) as EncompassVariationLink[];

  return uniqueBy(links, (item) => item.url);
}
