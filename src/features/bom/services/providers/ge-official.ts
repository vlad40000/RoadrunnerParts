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
  decodeHtmlEntities,
  fetchHtml,
  htmlToText,
  normalizeBrand,
  normalizeModel,
  uniqueBy,
} from "./utils";

const GE_FAMILY_BRANDS = new Set([
  "ge",
  "general electric",
  "ge appliances",
  "hotpoint",
  "cafe",
  "café",
  "profile",
  "ge profile",
  "monogram",
]);

type ParsedGeRow = {
  diagramNumber: number;
  description: string;
  originalPartNumber: string;
  currentServicePartNumber: string;
  nlaStatus: boolean;
  replacementNote: string | null;
};

function isGePartToken(token: string) {
  return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9-]{5,}$/.test(token);
}

function extractSectionNameFromUrl(url: string) {
  const last = url.split("/").pop() ?? "";
  return decodeURIComponent(last)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSectionLinks(html: string, model: string) {
  const base = `https://www.geapplianceparts.com`;
  const $ = load(html);

  const links = $('a[href*="/store/parts/ModelSectionParts/"]')
    .map((_, el) => {
      const href = $(el).attr("href");
      const text = cleanText($(el).text());

      if (!href) return null;
      if (!href.includes(`/store/parts/ModelSectionParts/${model}/`)) return null;

      const url = absoluteUrl(base, href);
      const sectionName = text || extractSectionNameFromUrl(url);

      return {
        url,
        sectionName,
      };
    })
    .get()
    .filter(Boolean) as Array<{ url: string; sectionName: string }>;

  return uniqueBy(links, (item) => item.url);
}

function parseGeRowsFromBodyText(bodyText: string): ParsedGeRow[] {
  const starts = [...bodyText.matchAll(/(\d+)\s+—\s+Diagram Number/g)];

  if (!starts.length) return [];

  const rows: ParsedGeRow[] = [];

  for (let i = 0; i < starts.length; i++) {
    const match = starts[i];
    const next = starts[i + 1];

    const diagramNumber = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? bodyText.length;
    const segment = cleanText(bodyText.slice(start, end));

    if (!segment) continue;

    const tokens = segment.split(" ");
    const partIndex = tokens.findIndex(isGePartToken);

    if (partIndex === -1) continue;

    const description = cleanText(tokens.slice(0, partIndex).join(" "));
    const originalPartNumber = tokens[partIndex];
    const tail = cleanText(tokens.slice(partIndex + 1).join(" "));

    const replacementIsNla = /Item has been replaced by\s+NLA ITEM/i.test(tail);
    const replacementMatch = tail.match(
      /Item has been replaced by\s+([A-Z0-9-]{5,})/i,
    );
    const replacementPart = replacementIsNla
      ? null
      : replacementMatch?.[1]?.toUpperCase() ?? null;

    const noLongerAvailable = /No Longer Available/i.test(tail);
    const nlaStatus = replacementIsNla || (noLongerAvailable && !replacementPart);

    rows.push({
      diagramNumber,
      description,
      originalPartNumber,
      currentServicePartNumber: replacementPart ?? originalPartNumber,
      nlaStatus,
      replacementNote: replacementPart
        ? `Replaced by ${replacementPart}`
        : nlaStatus
          ? "No replacement listed"
          : null,
    });
  }

  return rows;
}

function geRowsToStructuredText(input: {
  model: string;
  sectionName: string;
  rows: ParsedGeRow[];
}) {
  const lines = [
    `SOURCE_PROVIDER: ge-official`,
    `MODEL: ${input.model}`,
    `SECTION: ${input.sectionName}`,
  ];

  for (const row of input.rows) {
    lines.push(
      [
        "ROW",
        `diagram_number=${row.diagramNumber}`,
        `description=${row.description}`,
        `original_part_number=${row.originalPartNumber}`,
        `current_service_part_number=${row.currentServicePartNumber}`,
        `nla_status=${row.nlaStatus ? "true" : "false"}`,
        `replacement_note=${row.replacementNote ?? ""}`,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

async function fetchGeSectionSource(input: {
  model: string;
  sectionUrl: string;
  sectionName: string;
}): Promise<RetrievedSource | null> {
  const html = await fetchHtml(input.sectionUrl);
  const bodyText = htmlToText(html);
  const rows = parseGeRowsFromBodyText(bodyText);

  if (!rows.length) {
    return {
      sourceUrl: input.sectionUrl,
      sourceType: "oem",
      provider: "ge-official",
      sectionName: input.sectionName,
      text: [
        `SOURCE_PROVIDER: ge-official`,
        `MODEL: ${input.model}`,
        `SECTION: ${input.sectionName}`,
        `RAW_TEXT: ${bodyText}`,
      ].join("\n"),
      meta: {
        rowCount: 0,
      },
    };
  }

  return {
    sourceUrl: input.sectionUrl,
    sourceType: "oem",
    provider: "ge-official",
    sectionName: input.sectionName,
    text: geRowsToStructuredText({
      model: input.model,
      sectionName: input.sectionName,
      rows,
    }),
    meta: {
      rowCount: rows.length,
    },
  };
}

export const geOfficialProvider: SourceProvider = {
  name: "ge-official",
  priority: 10,

  supports(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return false;

    const brand = normalizeBrand(input.brand);
    return !brand || GE_FAMILY_BRANDS.has(brand);
  },

  async fetchSources(input: ProviderInput) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const assemblyUrl = `https://www.geapplianceparts.com/store/parts/assembly/${model}`;
    const html = await fetchHtml(assemblyUrl);
    const bodyText = htmlToText(html);

    if (!bodyText.includes(model)) {
      return [];
    }

    const sectionLinks = parseSectionLinks(html, model);

    const sources: RetrievedSource[] = [];

    for (const section of sectionLinks) {
      try {
        const source = await fetchGeSectionSource({
          model,
          sectionUrl: section.url,
          sectionName: section.sectionName,
        });

        if (source) {
          sources.push(source);
        }
      } catch {
        // Continue. One bad section should not kill the job.
      }
    }

    return sources;
  },
};
