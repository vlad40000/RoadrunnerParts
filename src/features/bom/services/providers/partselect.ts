import { load } from "cheerio";
import { type RetrievedSource } from "./types";
import { resolveExactModelUrl } from "../search/exact-model-url-resolver";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  normalizeModel,
} from "./utils";

export const partSelectProvider = {
  name: "partselect.com",
  priority: 8, // Viability Rank #2

  supports(input: { brand: string | null; model: string | null }) {
    return !!input.model;
  },

  async fetchSources(input: {
    brand: string | null;
    model: string | null;
    productType?: string | null;
  }): Promise<RetrievedSource[]> {
    const model = normalizeModel(input.model);
    
    // Step 1: Resolve exact model URL
    const resolution = await resolveExactModelUrl({
      model,
      domain: "partselect.com",
      preferredQueries: [
        `site:partselect.com "${model}" "Diagrams"`,
        `site:partselect.com "${model}" "Parts List"`,
        input.brand ? `site:partselect.com "${model}" "${input.brand}"` : "",
      ].filter(Boolean),
    });

    if (!resolution?.url) return [];

    try {
      const html = await fetchHtml(resolution.url);
      const $ = load(html);

      // Step 2: Look for diagram/section links
      const sections = $('.model-section-card, .diagram-card, a[href*="/Sections/"], .mega-m-section-list__item').map((_, el) => {
        const $el = $(el);
        const name = cleanText($el.find('.card-title, .section-name, .mega-m-section-list__name').text()) || cleanText($el.text());
        const href = $el.find('a').attr('href') || $el.attr('href');
        
        if (!name || !href) return null;
        return { name, url: absoluteUrl(resolution.url, href) };
      }).get().filter(Boolean);

      if (sections.length > 0) {
        return sections.map(s => ({
          sourceUrl: s.url,
          sourceType: "diagram" as const,
          provider: "partselect",
          sectionName: s.name,
          text: `SOURCE_PROVIDER: partselect\nMODEL: ${model}\nSECTION: ${s.name}\n(Parts extracted during grouping stage)`,
          meta: { ...resolution, isDiagramGroup: true }
        }));
      }

      // Step 3: Fallback to single page extraction
      const partsText = this.parsePartSelectToText(html, model);
      return [{
        sourceUrl: resolution.url,
        sourceType: "distributor" as const,
        provider: "partselect",
        sectionName: "All Model Parts",
        text: `SOURCE_PROVIDER: partselect\nMODEL: ${model}\nSECTION: All Model Parts\n${partsText}`,
        meta: { ...resolution, rowCount: partsText.split('\n').length - 3 }
      }];
    } catch (err) {
      console.error("PartSelect extraction failed:", err);
      return [];
    }
  },

  parsePartSelectToText(html: string, model: string): string {
    const $ = load(html);
    const lines = [`SOURCE_PROVIDER: partselect`, `MODEL: ${model}`, `SECTION: All Model Parts`];

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
};
