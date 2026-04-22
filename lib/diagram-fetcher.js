/**
 * Worker 6: Diagram Fetcher
 * Fetches part rows for a specific diagram/schematic group.
 */

import * as cheerio from 'cheerio';

/**
 * Fetches parts from a Sears diagram page.
 */
async function fetchSearsDiagramParts(diagram) {
  try {
    const response = await fetch(diagram.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const parts = [];
    $('.part-row').each((i, el) => {
      const description = $(el).find('.part-name').text().trim();
      const partNumber = $(el).find('.part-number').text().trim();
      const diagramRef = $(el).find('.diagram-ref').text().trim();
      
      if (partNumber && description) {
        parts.push({
          part_number: partNumber,
          description,
          diagram_group: diagram.label,
          diagram_ref: diagramRef || null,
          qty: 1, 
          source: 'sears',
          source_url: diagram.url,
          is_substitute: false
        });
      }
    });

    return parts;
  } catch (err) {
    console.error(`Sears diagram fetch error for ${diagram.label}`, err);
    return [];
  }
}

/**
 * Fetches parts from a Fix.com diagram page.
 */
async function fetchFixDiagramParts(diagram) {
  try {
    const response = await fetch(diagram.url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const parts = [];
    // Fix.com selectors: .part-list-item, .part-row, table tr
    $('.part-list-item, .part-row, table tr').each((i, el) => {
      const $item = $(el);
      const partNum = $item.find('.part-number, [itemprop="mpn"], .part-no').last().text().trim();
      const description = $item.find('.part-description, [itemprop="name"]').first().text().trim() || "Appliance Part";
      const diagramRef = $item.find('.key-number, .callout-number').text().trim();
      
      if (partNum) {
        parts.push({
          part_number: partNum.toUpperCase(),
          description,
          diagram_group: diagram.label,
          diagram_ref: diagramRef || null,
          qty: 1,
          source: 'fix',
          source_url: diagram.url,
          is_substitute: false
        });
      }
    });

    return parts;
  } catch (err) {
    console.error(`Fix.com diagram fetch error for ${diagram.label}`, err);
    return [];
  }
}

/**
 * Main entry point for Worker 6 with retry logic.
 */
export async function fetchDiagramPartsWithRetry({ diagram, retries = 2 }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = String(diagram.url || '').toLowerCase();
      if (url.includes('searspartsdirect')) {
        return await fetchSearsDiagramParts(diagram);
      }
      if (url.includes('fix.com')) {
        return await fetchFixDiagramParts(diagram);
      }
      return [];
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = 500 * Math.pow(3, attempt); // 500ms -> 1500ms
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  console.warn(`Giving up on diagram ${diagram.label} after ${retries} retries.`);
  return [];
}
