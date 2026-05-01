import "server-only";
import { load } from "cheerio";
import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { cleanText, fetchHtml, normalizeBrand, normalizeModel, uniqueBy, absoluteUrl } from "./utils";
import { buildAppliancePartsProsUrl } from "./deterministic-urls";

const PROVIDER_NAME = "appliancepartspros";

interface AppliancePartsProsDiagram {
  url: string;
  name: string;
}

function parseAppliancePartsProsDiagrams(html: string, _modelUrl: string): AppliancePartsProsDiagram[] {
  const $ = load(html);
  const diagrams = $('.model-section-card, a[href*="/diagram/"]')
    .map((_, el) => {
      const href = $(el).attr("href");
      const name = cleanText($(el).find(".card-title, .section-name, .model-section-title").text()) || 
                   cleanText($(el).text());
      
      if (!href) return null;
      return {
        url: absoluteUrl("https://www.appliancepartspros.com", href),
        name: name || "Miscellaneous",
      };
    })
    .get()
    .filter(Boolean) as AppliancePartsProsDiagram[];
    
  return uniqueBy(diagrams, (d) => d.url);
}

export const appliancePartsProsProvider: SourceProvider = {
  name: PROVIDER_NAME,
  priority: 15,

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput) {
    const model = normalizeModel(input.model);
    const brand = normalizeBrand(input.brand ?? "");
    if (!model || !brand) return [];

    const deterministicUrl = buildAppliancePartsProsUrl({ brand, model });
    
    try {
      const html = await fetchHtml(deterministicUrl);
      if (!html.toUpperCase().includes(model)) return [];

      const diagrams = parseAppliancePartsProsDiagrams(html, deterministicUrl);
      
      if (diagrams.length === 0) {
        // Just the model page itself if no diagrams found
        return [{
          sourceUrl: deterministicUrl,
          sourceType: "distributor",
          provider: PROVIDER_NAME,
          sectionName: "All Model Parts",
          text: [
            `SOURCE_PROVIDER: ${PROVIDER_NAME}`,
            `MODEL: ${model}`,
            `BRAND: ${brand}`,
            `SECTION: All Model Parts`,
            `URL: ${deterministicUrl}`,
          ].join("\n"),
          meta: {
            deterministic: true,
          }
        }];
      }

      return diagrams.map(d => ({
        sourceUrl: d.url,
        sourceType: "diagram",
        provider: PROVIDER_NAME,
        sectionName: d.name,
        text: [
          `SOURCE_PROVIDER: ${PROVIDER_NAME}`,
          `MODEL: ${model}`,
          `BRAND: ${brand}`,
          `SECTION: ${d.name}`,
          `URL: ${d.url}`,
        ].join("\n"),
        meta: {
          deterministic: true,
        }
      }));
    } catch {
      return [];
    }
  }
};
