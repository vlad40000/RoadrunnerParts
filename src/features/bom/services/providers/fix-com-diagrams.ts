import "server-only";
import { load } from "cheerio";
import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  normalizeModel,
  uniqueBy,
} from "./utils";

async function resolveFixModelUrl(input: {
  model: string;
}) {
  const model = normalizeModel(input.model);

  return resolveExactModelUrl({
    model,
    domain: "fix.com",
    preferredQueries: [
      `site:fix.com "${model}" "Sections"`,
      `site:fix.com "${model}" "Parts"`,
      `site:fix.com "${model}" "Diagram"`,
    ],
  });
}

function parseFixSections(modelUrl: string, html: string) {
  const $ = load(html);
  const sections: Array<{ name: string; url: string }> = [];

  // Fix.com structure: identical to PartSelect
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

function parseFixRows(html: string): any[] {
  const $ = load(html);
  const rows: any[] = [];

  // Fix.com structure: usually grid or table items
  $(".part-list-item, .part-row, table tr").each((_, el) => {
    const $item = $(el);
    const partNum = cleanText($item.find(".part-number, [itemprop='mpn'], .part-no").last().text());
    const description = cleanText($item.find(".part-description, [itemprop='name']").first().text()) || "Appliance Part";
    const diagramRef = cleanText($item.find(".key-number, .callout-number").text());

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

export const fixComDiagramsProvider: SourceProvider = {
  name: "fix-com-diagrams",
  priority: 5, // Highest priority distributor (runs before Sears 10)

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput & { productType?: string | null }) {
    const model = normalizeModel(input.model);
    if (!model) return [];

    const resolution = await resolveFixModelUrl({ model });
    if (!resolution?.url) return [];

    const url = resolution.url;
    const html = await fetchHtml(url);
    
    // Check for sections
    const sections = parseFixSections(url, html);

    if (sections.length > 0) {
      return sections.map(s => ({
        sourceUrl: s.url,
        sourceType: "diagram" as const,
        provider: "fix-com-diagrams",
        sectionName: s.name,
        text: `SOURCE_PROVIDER: fix-com-diagrams\nMODEL: ${model}\nSECTION: ${s.name}\n(Diagram groups are typically extracted sequentially by the core engine)`,
        meta: {
          ...resolution,
          isDiagramGroup: true
        }
      }));
    }

    // Fallback: If no sections found, maybe it's a flat list
    const rows = parseFixRows(html);
    return [
      {
        sourceUrl: url,
        sourceType: "distributor" as const,
        provider: "fix-com-diagrams",
        sectionName: "All Model Parts",
        text: `SOURCE_PROVIDER: fix-com-diagrams\nMODEL: ${model}\nSECTION: All Model Parts\n` + 
          rows.map(r => `ROW|diagram_number=${r.diagramRef}|description=${r.description}|original_part_number=|current_service_part_number=${r.partNumber}|nla_status=false|replacement_note=`).join("\n"),
        meta: {
          ...resolution,
          rowCount: rows.length
        }
      }
    ];
  },
};
