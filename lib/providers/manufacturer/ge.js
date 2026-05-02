import 'server-only';
import * as cheerio from 'cheerio';
import { normalizeModelNumber } from '@/lib/normalize';
import { EMPTY_BOM_RESULT } from './base';

const GE_BASE = 'https://www.geapplianceparts.com';

/**
 * Absolute URL construction for GE domain.
 */
function absoluteUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${GE_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Robust HTML fetch with AbortController timeout. 
 */
async function fetchHtml(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RoadRunnerPartsBot/1.0; +https://example.com/bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalize whitespace and trim string.
 */
function normalizeWhitespace(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Deduplicate items by key function result.
 */
function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Extracted summary from headers.
 */
function parseSummary($, model) {
  const candidates = [
    normalizeWhitespace($('h1').first().text()),
    normalizeWhitespace($('h2').first().text()),
    normalizeWhitespace($('h3').first().text()),
  ].filter(Boolean);

  const machineLine = candidates.find((v) => v !== model) || candidates[0] || '';
  return `GE OEM BOM for ${model}. ${machineLine}`.trim();
}

/**
 * Find all section/diagram links on the model assembly page.
 */
function parseSectionLinks($, model) {
  const links = [];
  $('a[href*="/store/parts/ModelSectionParts/"]').each((_, el) => {
    const href = $(el).attr('href');
    const label = normalizeWhitespace($(el).text());
    if (!href || !label || !href.includes(model)) return;
    links.push({ title: label, url: absoluteUrl(href) });
  });

  return uniqBy(links, (item) => item.url);
}

/**
 * Extract "Popular Accessories" from the main assembly page.
 */
function parseAccessories($, assemblyUrl) {
  const text = normalizeWhitespace($('body').text());
  const start = text.indexOf('Popular Accessories');
  const end = text.indexOf('Replacement Parts by Section / Assembly Diagram');
  if (start === -1 || (end !== -1 && end <= start)) return [];

  const block = end !== -1 ? text.slice(start, end) : text.slice(start);
  const parts = [];
  const regex = /([A-Za-z0-9'®\-\/&,().+ ]{3,}?)\s+([A-Z0-9]{2,}(?:[A-Z0-9\-]{1,}))\s+\$\s*([0-9]+(?:\.[0-9]{2})?)/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    const name = normalizeWhitespace(match[1]);
    const partNumber = normalizeWhitespace(match[2]);
    if (!name || !partNumber) continue;
    parts.push({
      source: 'geapplianceparts.com',
      sectionName: 'Popular Accessories',
      sectionUrl: assemblyUrl,
      rawPartNumber: partNumber,
      rawPartName: name,
      rawCategory: 'Accessories',
      providerItemId: partNumber,
      evidenceUrl: assemblyUrl,
    });
  }

  return uniqBy(parts, (item) => `${item.rawPartNumber}|${item.sectionName}`);
}

/**
 * Parse individual section diagram page.
 */
function parseSectionPage(html, sectionName, sectionUrl) {
  const $ = cheerio.load(html);
  const bodyText = normalizeWhitespace($('body').text());
  const rows = [];

  const pattern = /(\d+)\s+—\s+Diagram Number\s+(.+?)\s+([A-Z0-9]{2,}(?:[A-Z0-9\-]{1,}))\s+(?:(\$\s*[0-9]+(?:\.[0-9]{2})?)|No Longer Available)(?:\s+Item has been replaced by\s+([A-Z0-9]{2,}(?:[A-Z0-9\-]{1,})))?(?=\s+\d+\s+—\s+Diagram Number|$)/g;

  let match;
  while ((match = pattern.exec(bodyText)) !== null) {
    const diagramRef = normalizeWhitespace(match[1]);
    const name = normalizeWhitespace(match[2]);
    const partNumber = normalizeWhitespace(match[3]);
    const substitute = normalizeWhitespace(match[5]);

    if (!name || !partNumber) continue;

    rows.push({
      source: 'geapplianceparts.com',
      sectionName,
      sectionUrl,
      diagramRef,
      rawPartNumber: partNumber,
      rawPartName: name,
      rawCategory: sectionName,
      substitutePartNumber: substitute || null,
      providerItemId: `${sectionName}:${diagramRef}`,
      evidenceUrl: sectionUrl,
    });
  }

  return uniqBy(rows, (item) => `${item.rawPartNumber}|${item.sectionName}|${item.diagramRef}`);
}

/**
 * Deterministic GE Manufacturer Adapter.
 */
export async function fetchGeManufacturerBom({ modelNumber, timeoutMs = 12000 }) {
  const model = normalizeModelNumber(modelNumber);
  const assemblyUrl = `${GE_BASE}/store/parts/assembly/${encodeURIComponent(model)}`;

  console.log(`[Adapter GE] Fetching assembly: ${assemblyUrl}`);
  const assemblyHtml = await fetchHtml(assemblyUrl, timeoutMs);
  const $ = cheerio.load(assemblyHtml);

  const sectionLinks = parseSectionLinks($, model);
  const accessories = parseAccessories($, assemblyUrl);
  const summary = parseSummary($, model);

  const allRows = [...accessories];
  const sectionSources = [{ title: `${model} Assembly`, uri: assemblyUrl }];
  let sectionFetchFailures = 0;

  console.log(`[Adapter GE] Found ${sectionLinks.length} sections to crawl`);

  for (const section of sectionLinks) {
    try {
      const sectionHtml = await fetchHtml(section.url, timeoutMs);
      const rows = parseSectionPage(sectionHtml, section.title, section.url);
      allRows.push(...rows);
      sectionSources.push({ title: section.title, uri: section.url });
    } catch (error) {
      sectionFetchFailures += 1;
      console.error(`[Adapter GE] Section fetch failed: ${section.url}`, error);
    }
  }

  const coverageFlags = [];
  if (sectionFetchFailures > 0) coverageFlags.push(`manufacturer-sections-failed:${sectionFetchFailures}`);
  if (allRows.length === 0) coverageFlags.push('manufacturer-no-parts');

  return {
    truthSource: 'GE Appliances manufacturer catalog',
    sourceStrategy: 'manufacturer-first-deterministic',
    modelUrl: assemblyUrl,
    summary,
    parts: allRows,
    coverage: {
      sectionsDiscovered: sectionLinks.length + (accessories.length > 0 ? 1 : 0),
      sectionsFetched: (sectionLinks.length - sectionFetchFailures) + (accessories.length > 0 ? 1 : 0),
      sectionFetchFailures,
      paginationComplete: true,
      flags: coverageFlags,
    },
  };
}
