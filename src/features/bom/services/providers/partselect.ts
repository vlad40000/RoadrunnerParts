import { load } from "cheerio";
import { type RetrievedSource, type ProviderInput, type SourceProvider } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  normalizeBrand,
  normalizeModel,
} from "./utils";
import { buildPartSelectSamsungUrl, buildPartSelectUrl } from "./deterministic-urls";

interface PartSelectFetchInput extends ProviderInput {
  productType?: string | null;
}

async function extractFromPage(
  html: string,
  url: string,
  model: string
): Promise<RetrievedSource[]> {
  const $ = load(html);

  // Look for diagram/section links
  const sections = $('.model-section-card, .diagram-card, a[href*="/Sections/"], .mega-m-section-list__item').map((_, el) => {
    const $el = $(el);
    const name = cleanText($el.find('.card-title, .section-name, .mega-m-section-list__name').text()) || cleanText($el.text());
    const href = $el.find('a').attr('href') || $el.attr('href');
    
    if (!name || !href) return null;
    return { name, url: absoluteUrl(url, href) };
  }).get().filter(Boolean);

  if (sections.length > 0) {
    return sections.map(s => ({
      sourceUrl: s.url,
      sourceType: "diagram",
      provider: "partselect",
      sectionName: s.name,
      text: `SOURCE_PROVIDER: partselect\nMODEL: ${model}\nSECTION: ${s.name}\n(Parts extracted during grouping stage)`,
      meta: { url, isDiagramGroup: true }
    }));
  }

  // Fallback to single page extraction
  const partsText = parsePartSelectToText(html, model);
  return [{
    sourceUrl: url,
    sourceType: "distributor",
    provider: "partselect",
    sectionName: "All Model Parts",
    text: `SOURCE_PROVIDER: partselect\nMODEL: ${model}\nSECTION: All Model Parts\n${partsText}`,
    meta: { url, rowCount: partsText.split('\n').length - 3 }
  }];
}

function parsePartSelectToText(html: string, model: string): string {
  const $ = load(html);
  const lines: string[] = [`SOURCE_PROVIDER: partselect`, `MODEL: ${model}`, `SECTION: All Model Parts`];

  $('.mega-m-parts-list__item, .part-list-item, .parts-list tr, [data-test="part-item"]').each((_, el) => {
    const $el = $(el);
    const partNum = cleanText($el.find('.mega-m-parts-list__part-num, .part-number, [data-test="part-number"], td:nth-child(1)').text());
    const description = cleanText($el.find('.mega-m-parts-list__description, .part-description, [data-test="part-name"], td:nth-child(2)').text());
    const ref = cleanText($el.find('.key-number, .diagram-ref, .pd-key-number').text());

    if (partNum && description) {
      lines.push(`ROW|diagram_number=${ref}|description=${description}|original_part_number=|current_service_part_number=${partNum}|nla_status=false|replacement_note=`);
    }
  });

  return lines.join("\n");
}

export const partSelectProvider: SourceProvider = {
  name: "partselect.com",
  priority: 8, // Viability Rank #2

  supports(input: ProviderInput): boolean {
    return !!input.model;
  },

  async fetchSources(input: ProviderInput): Promise<RetrievedSource[]> {
    const fetchInput = input as PartSelectFetchInput;
    const model = normalizeModel(fetchInput.model);
    const brand = normalizeBrand(fetchInput.brand ?? "");
    
    // Check for Samsung variant
    if (brand.includes("samsung") && fetchInput.model?.includes("/")) {
      const parts = fetchInput.model.split("/");
      const base = parts[0];
      const version = parts[1];
      const deterministicUrl = buildPartSelectSamsungUrl({ model: base, version });
      
      try {
        const html = await fetchHtml(deterministicUrl);
        if (html.toUpperCase().includes(normalizeModel(base))) {
          const sources = await extractFromPage(html, deterministicUrl, normalizeModel(base));
          if (sources.length > 0) return sources;
        }
      } catch {
        // ignore and fallback
      }
    }

    // Step 0: Try deterministic URL
    const deterministicUrl = buildPartSelectUrl({ brand, model });
    if (deterministicUrl) {
      try {
        const html = await fetchHtml(deterministicUrl);
        if (html.toUpperCase().includes(model)) {
          const sources = await extractFromPage(html, deterministicUrl, model);
          if (sources.length > 0) return sources;
        }
      } catch {
        // ignore and fallback
      }
    }
    const resolution = await resolveExactModelUrl({
      model,
      domain: "partselect.com",
      preferredQueries: [
        `site:partselect.com "${model}" "Diagrams"`,
        `site:partselect.com "${model}" "Parts List"`,
        fetchInput.brand ? `site:partselect.com "${model}" "${fetchInput.brand}"` : "",
      ].filter(Boolean),
    });

    if (!resolution?.url) return [];

    try {
      const html = await fetchHtml(resolution.url);
      return await extractFromPage(html, resolution.url, model);
    } catch (err) {
      console.error("PartSelect extraction failed:", err);
      return [];
    }
  }
};
