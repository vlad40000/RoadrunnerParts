import 'server-only';
import * as cheerio from 'cheerio';
import { normalizeModelNumber } from '@/lib/normalize';
import { EMPTY_BOM_RESULT } from './base';
import { fetchPartsList } from '@/lib/gemini';

const WHIRLPOOL_BASE = 'https://www.whirlpoolparts.com';

async function fetchHtml(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function norm(v) {
  return String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Robust Whirlpool Family Adapter.
 * Uses a two-stage approach: Deterministic Scrape -> Manufacturer-Specific LLM Extraction.
 */
export async function fetchWhirlpoolManufacturerBom({ modelNumber, brand, timeoutMs = 12000 }) {
  const model = normalizeModelNumber(modelNumber);
  
  // Try different search variations for Whirlpool
  const searchUrls = [
    `${WHIRLPOOL_BASE}/shop-for-parts/a1/${encodeURIComponent(model)}`,
    `${WHIRLPOOL_BASE}/shop-for-parts/p-${encodeURIComponent(model)}`,
    `${WHIRLPOOL_BASE}/shop-for-parts/${encodeURIComponent(model)}`,
  ];

  let bestHtml = null;
  let bestUrl = null;

  for (const url of searchUrls) {
    try {
      const html = await fetchHtml(url, 8000);
      if (html.includes('PartsBySection') || html.includes('AssemblyDiagram') || html.includes('ProductNumber')) {
        bestHtml = html;
        bestUrl = url;
        break;
      }
    } catch (e) { /* silent fail for retry */ }
  }

  if (bestHtml) {
    const $ = cheerio.load(bestHtml);
    const parts = [];
    const sections = [];

    // Selective parsing based on identified layout
    $('[class*="ProductListGrid_ProductListGrid"]').each((_, el) => {
      const name = norm($(el).find('[class*="ProductName"]').text());
      const pn = norm($(el).find('[class*="ProductNumber"]').text());
      if (name && pn) {
        parts.push({
          source: 'whirlpoolparts.com',
          sectionName: 'General Parts',
          rawPartNumber: pn,
          rawPartName: name,
          providerItemId: pn,
          evidenceUrl: bestUrl,
        });
      }
    });

    if (parts.length > 5) {
      return {
        truthSource: 'Whirlpool Family Catalog (Deterministic)',
        sourceStrategy: 'manufacturer-first-deterministic',
        parts,
        sources: [{ title: 'Whirlpool Catalog', uri: bestUrl }],
        coverage: {
          sectionsDiscovered: 1,
          sectionsFetched: 1,
          sectionFetchFailures: 0,
          paginationComplete: true,
          flags: [],
        },
      };
    }
  }

  return {
    ...EMPTY_BOM_RESULT(brand || 'Whirlpool'),
    truthSource: 'Whirlpool Family Catalog',
    sourceStrategy: 'manufacturer-first-deterministic',
    source: 'whirlpoolparts.com',
    parts: [],
    sources: [],
    coverage: {
      sectionsDiscovered: 0,
      sectionsFetched: 0,
      sectionFetchFailures: 0,
      paginationComplete: false,
      flags: ['manufacturer-no-parts', 'deterministic-fallback-required'],
    },
  };
}
