import "server-only";
import { load } from "cheerio";
import type { ProviderInput, RetrievedSource, SourceProvider } from "./types";
import { cleanText, fetchHtml, normalizeBrand, normalizeModel, uniqueBy, absoluteUrl } from "./utils";
import { buildPartsDrUrl } from "./deterministic-urls";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";

const PROVIDER_NAME = "partsdr";

interface PartsDrDiagram {
  url: string;
  name: string;
}

function parsePartsDrDiagrams(html: string, _modelUrl: string): PartsDrDiagram[] {
  const $ = load(html);
  // Parts Dr often has sections listed as links
  const diagrams = $('a[href*="/diagram/"], .model-diagram-link')
    .map((_, el) => {
      const href = $(el).attr("href");
      const name = cleanText($(el).text());
      
      if (!href) return null;
      return {
        url: absoluteUrl("https://partsdr.com", href),
        name: name || "Miscellaneous",
      };
    })
    .get()
    .filter(Boolean) as PartsDrDiagram[];
    
  return uniqueBy(diagrams, (d) => d.url);
}

export const partsDrProvider: SourceProvider = {
  name: PROVIDER_NAME,
  priority: 15,

  supports(input: ProviderInput) {
    return !!normalizeModel(input.model);
  },

  async fetchSources(input: ProviderInput) {
    const model = normalizeModel(input.model);
    const brand = normalizeBrand(input.brand ?? "");
    if (!model || !brand) return [];

    const deterministicUrl = buildPartsDrUrl({ brand, model, applianceType: input.applianceType });
    
    let html = "";
    let finalUrl = deterministicUrl;
    
    try {
      html = await fetchHtml(deterministicUrl);
      if (!html.toUpperCase().includes(model)) {
        html = ""; // trigger fallback
      }
    } catch {
      // trigger fallback
    }

    if (!html) {
      // Fallback to search resolution for Parts Dr as requested by user
      const resolution = await resolveExactModelUrl({
        model,
        domain: "partsdr.com",
        preferredQueries: [
          `site:partsdr.com "${model}" "${brand}"`,
          `site:partsdr.com/appliance-models "${model}"`,
        ],
      });

      if (resolution?.url) {
        finalUrl = resolution.url;
        try {
          html = await fetchHtml(finalUrl);
        } catch {
          return [];
        }
      }
    }

    if (!html) return [];

    const diagrams = parsePartsDrDiagrams(html, finalUrl);
    
    if (diagrams.length === 0) {
      return [{
        sourceUrl: finalUrl,
        sourceType: "distributor",
        provider: PROVIDER_NAME,
        sectionName: "All Model Parts",
        text: [
          `SOURCE_PROVIDER: ${PROVIDER_NAME}`,
          `MODEL: ${model}`,
          `BRAND: ${brand}`,
          `SECTION: All Model Parts`,
          `URL: ${finalUrl}`,
        ].join("\n"),
        meta: {
          urlFound: finalUrl,
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
        urlFound: d.url,
      }
    }));
  }
};
