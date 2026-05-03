// import "server-only";
import { load } from "cheerio";
import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  htmlToText,
  normalizeModel,
  uniqueBy,
} from "./utils";

async function resolvePartSelectModelUrl(input: {
  model: string;
}) {
  const model = normalizeModel(input.model);

  return resolveExactModelUrl({
    model,
    domain: "partselect.com",
    preferredQueries: [
      `site:partselect.com "${model}" "Sections"`,
      `site:partselect.com "${model}" "Parts"`,
      `site:partselect.com "${model}" "Diagram"`,
    ],
  });
}

function parsePartSelectSections(modelUrl: string, html: string) {
  const $ = load(html);
  const sections: Array<{ name: string; url: string }> = [];

  // Look for sections in the main content area
  // PartSelect often uses a grid or list of assembly sections
  $(".mega-m-section a, .model-section-list a, .assemblies a").each((_, el) => {
    const name = cleanText($(el).text());
    const href = $(el).attr("href");
    if (name && href) {
      sections.push({
        name,
        url: absoluteUrl(modelUrl, href),
      });
    }
  });

  return uniqueBy(sections, s => s.url);
}

function parsePartSelectRows(html: string): any[] {
  const $ = load(html);
  const rows: any[] = [];

  // PartSelect structure: usually <table> with Part #, Description, etc.
  $("table tr, .part-list-item").each((_, el) => {
    const partNum = cleanText($(el).find(".part-number, [itemprop='mpn']").text());
    const description = cleanText($(el).find(".part-description, [itemprop='name']").text()) || "Appliance Part";
    const diagramRef = cleanText($(el).find(".key-number").text());

    if (partNum) {
      rows.push({
        partNumber: partNum.toUpperCase(),
        description,
        diagramRef,
      });
    }
  });

  return rows;
}

export const partSelectDiagramsProvider: SourceProvider = {
  name: "partselect-diagrams",
  priority: 15, // Higher than generic fallbacks, lower than Sears

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput & { productType?: string | null }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const resolution = await resolvePartSelectModelUrl({ model });
    if (!resolution?.url) return [];

    const url = resolution.url;
    const html = await fetchHtml(url);
    
    // First, check for sections
    const sections = parsePartSelectSections(url, html);

    if (sections.length > 0) {
      return sections.map(s => ({
        sourceUrl: s.url,
        sourceType: "diagram" as const,
        provider: "partselect-diagrams",
        sectionName: s.name,
        text: `SOURCE_PROVIDER: partselect-diagrams\nMODEL: ${model}\nSECTION: ${s.name}\n(Diagram groups are typically extracted sequentially by the core engine)`,
        meta: {
          ...resolution,
          isDiagramGroup: true
        }
      }));
    }

    // Fallback: If no sections found, maybe it's a flat list
    const rows = parsePartSelectRows(html);
    return [
      {
        sourceUrl: url,
        sourceType: "distributor" as const,
        provider: "partselect-diagrams",
        sectionName: "All Model Parts",
        text: `SOURCE_PROVIDER: partselect-diagrams\nMODEL: ${model}\nSECTION: All Model Parts\n` + 
          rows.map(r => `ROW|diagram_number=${r.diagramRef}|description=${r.description}|original_part_number=|current_service_part_number=${r.partNumber}|nla_status=false|replacement_note=`).join("\n"),
        meta: {
          ...resolution,
          rowCount: rows.length
        }
      }
    ];
  },
};
