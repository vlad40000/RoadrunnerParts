import { load } from "cheerio";
import { type RetrievedSource } from "./types";
import {
  absoluteUrl,
  cleanText,
  fetchHtml,
  normalizeModel,
} from "./utils";

export const partSelectFallbackProvider = {
  name: "partselect-fallback",
  priority: 30,

  supports(input: { brand: string | null; model: string | null }) {
    return !!input.model;
  },

  async fetchSources(input: {
    brand: string | null;
    model: string | null;
  }): Promise<RetrievedSource[]> {
    const model = normalizeModel(input.model);
    const searchUrl = `https://www.partselect.com/lookup.aspx?ModelNum=${model}`;

    try {
      const html = await fetchHtml(searchUrl);
      const $ = load(html);

      // Check for exact model landing page vs search results
      const isModelPage = $('.model-parts-list').length > 0 || $('.parts-list').length > 0;
      
      if (!isModelPage) {
        // Try to find the first exact model link if we're on a search results page
        const exactLink = $(`a[href*="${model}"]:first`).attr('href');
        if (exactLink) {
          const followHtml = await fetchHtml(absoluteUrl(searchUrl, exactLink));
          return this.parsePartSelectRows(followHtml, absoluteUrl(searchUrl, exactLink));
        }
        return [];
      }

      return this.parsePartSelectRows(html, searchUrl);
    } catch (err) {
      console.error("PartSelect Fallback failed:", err);
      return [];
    }
  },

  parsePartSelectRows(html: string, url: string): RetrievedSource[] {
    const $ = load(html);
    const rows: any[] = [];

    // Target the main parts list items
    $('.mega-m-parts-list__item, .part-list-item, .parts-list tr').each((_, el) => {
      const $el = $(el);
      
      // Extraction logic targeting common PartSelect patterns
      const description = cleanText($el.find('.mega-m-parts-list__description, .part-description, td:nth-child(2)').text());
      const partNum = cleanText($el.find('.mega-m-parts-list__part-num, .part-number, td:nth-child(1)').text());
      
      if (description && partNum) {
        rows.push({
          partNumber: partNum,
          description: description,
          section: cleanText($('.model-section-title, h2').first().text()) || 'General',
        });
      }
    });

    if (rows.length === 0) return [];

    return [
      {
        sourceUrl: url,
        sourceType: "fallback",
        provider: "partselect",
        text: JSON.stringify(rows, null, 2),
      },
    ];
  },
};
