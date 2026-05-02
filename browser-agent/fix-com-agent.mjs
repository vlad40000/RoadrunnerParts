import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupeParts, verifyBomCompleteness } from './cove-verifier.mjs';
import { runCoveReviewer } from './cove-reviewer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const FIX_BASE = 'https://www.fix.com';

const FIX_BRAND_SLUGS = {
  GE: 'ge',
  'GENERAL ELECTRIC': 'ge',
  'GE APPLIANCES': 'ge',
  HOTPOINT: 'hotpoint',
  HAIER: 'haier',
  MONOGRAM: 'monogram',
  WHIRLPOOL: 'whirlpool',
  MAYTAG: 'maytag',
  KITCHENAID: 'kitchenaid',
  AMANA: 'amana',
  KENMORE: 'kenmore',
  FRIGIDAIRE: 'frigidaire',
  ELECTROLUX: 'electrolux',
  LG: 'lg',
  SAMSUNG: 'samsung',
  BOSCH: 'bosch',
};

const FIX_APPLIANCE_SLUGS = {
  washer: 'washer',
  'washing machine': 'washer',
  dryer: 'dryer',
  dishwasher: 'dishwasher',
  refrigerator: 'refrigerator',
  fridge: 'refrigerator',
  freezer: 'freezer',
  range: 'range',
  stove: 'range',
  oven: 'range',
  microwave: 'microwave',
  cooktop: 'cooktop',
};

function cleanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeModel(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '');
}

function sortPartsByName(parts) {
  return [...parts].sort((a, b) =>
    cleanText(a.rawPartName || a.partName || a.description).localeCompare(
      cleanText(b.rawPartName || b.partName || b.description),
    ),
  );
}

function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildFixModelUrl({ brand, productType, model }) {
  const brandKey = cleanText(brand).toUpperCase();
  const typeKey = cleanText(productType).toLowerCase();
  const brandSlug = FIX_BRAND_SLUGS[brandKey] || slugify(brandKey) || 'appliance';
  const applianceSlug = FIX_APPLIANCE_SLUGS[typeKey] || slugify(typeKey) || 'appliance';
  return `${FIX_BASE}/models/${applianceSlug}/${brandSlug}/${normalizeModel(model)}/`;
}

function absoluteUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseFixCountFromText(text) {
  const match = cleanText(text).match(/Viewing\s+(\d+)(?:\s*-\s*\d+)?\s+of\s+(\d+)/i);
  if (!match) return null;
  return {
    visibleCount: Number(match[1]),
    totalPartsAvailable: Number(match[2]),
    evidence: match[0],
  };
}

function parsePartNumber(value) {
  const text = cleanText(value).toUpperCase();
  const labeled = text.match(/(?:PART\s*(?:NUMBER|NO\.?|#)?|ITEM\s*#)\s*:?\s*([A-Z0-9-]{4,})/i);
  if (labeled?.[1]) return labeled[1].toUpperCase();
  const candidate = text.match(/\b[A-Z]{1,5}[0-9][A-Z0-9-]{3,}\b/);
  return candidate?.[0] || null;
}

function parsePartAlt(alt) {
  const text = cleanText(alt);
  const match = text.match(/^(.*?)\s+(?:[\u2013\u2014-])\s+Part Number:\s*([A-Z0-9-]+)$/i);
  if (!match) return null;
  return {
    description: cleanText(match[1]),
    partNumber: cleanText(match[2]).toUpperCase(),
  };
}

function valueFromKeys(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && cleanText(obj[key])) {
      return obj[key];
    }
  }
  return null;
}

function extractRowsFromJsonPayload(payload, context = {}) {
  const rows = [];
  const visited = new Set();

  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    const partNumber = parsePartNumber(
      valueFromKeys(value, [
        'partNumber',
        'part_number',
        'partNo',
        'part_num',
        'manufacturerPartNumber',
        'mfgPartNumber',
        'servicePartNumber',
        'sku',
      ]),
    );

    const partName = cleanText(
      valueFromKeys(value, [
        'partName',
        'part_name',
        'name',
        'description',
        'title',
        'displayName',
      ]),
    );

    if (partNumber && partName) {
      rows.push({
        source: 'fix.com',
        sectionName: context.sectionName || cleanText(value.sectionName || value.category) || 'General Assembly',
        sectionUrl: context.sourceUrl || null,
        rawPartNumber: partNumber,
        rawPartName: partName,
        rawCategory: context.sectionName || cleanText(value.category || value.sectionName) || 'General Assembly',
        quantity: value.quantity || value.qty || null,
        providerItemId: value.id || value.partId || value.itemId || null,
        substitutePartNumber: value.replacementPartNumber || value.substitutePartNumber || null,
        serialNote: value.applicability || value.serialNote || null,
        price: value.price || value.priceText || null,
        evidenceUrl: context.sourceUrl || context.responseUrl || null,
        rawPayload: {
          extraction: 'captured-json',
          responseUrl: context.responseUrl || null,
          row: value,
        },
      });
    }

    Object.values(value).forEach(walk);
  }

  walk(payload);
  return rows;
}

function createResponseCollector() {
  const capturedApiUrls = new Set();
  const rows = [];
  let sectionName = 'Model Page';
  let sourceUrl = null;

  return {
    setContext(next) {
      sectionName = next.sectionName || sectionName;
      sourceUrl = next.sourceUrl || sourceUrl;
    },
    attach(page) {
      page.on('response', async (response) => {
        const contentType = response.headers()['content-type'] || '';
        const url = response.url();
        const resourceType = response.request().resourceType();
        const likelyJson =
          contentType.includes('application/json') ||
          resourceType === 'xhr' ||
          resourceType === 'fetch' ||
          /api|part|diagram|model/i.test(url);

        if (!likelyJson || response.status() >= 400) return;

        try {
          const json = await response.json();
          const extracted = extractRowsFromJsonPayload(json, {
            sectionName,
            sourceUrl,
            responseUrl: url,
          });
          if (extracted.length > 0) {
            capturedApiUrls.add(url);
            rows.push(...extracted);
          }
        } catch {
          // Non-JSON XHRs are expected on rendered commerce pages.
        }
      });
    },
    rows() {
      return rows;
    },
    urls() {
      return [...capturedApiUrls];
    },
  };
}

async function gotoRendered(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function clickViewMoreUntilSettled(page) {
  for (let i = 0; i < 8; i += 1) {
    const clicked = await page.evaluate(() => {
      function isVisible(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }

      const pattern = /(view|show|load|see)\s+more|see all|show all/i;
      const candidates = Array.from(document.querySelectorAll('button, a'))
        .filter((el) => pattern.test(el.textContent || '') && isVisible(el));

      const target = candidates[0];
      if (!target) return false;
      target.click();
      return true;
    });

    if (!clicked) break;
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(750);
  }
}

async function parseCountFromPage(page) {
  const text = await page.evaluate(() => document.body?.innerText || '');
  return parseFixCountFromText(text);
}

async function collectDiagramLinks(page, modelUrl) {
  const diagrams = await page.evaluate(() => {
    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    const cards = Array.from(document.querySelectorAll(
      '.row.mb-3.diagrams.no-gutters .diagram-item, .diagram-item, .model-section-card, .diagram-card, .model-diagram',
    ));

    const fromCards = cards.map((card) => {
      const link = card.querySelector('a[href]');
      const img = card.querySelector('img');
      const label =
        clean(card.querySelector('span, h2, h3, .card-title, .section-name, .model-section-title')?.textContent) ||
        clean(img?.getAttribute('alt')) ||
        clean(card.textContent);

      return {
        name: label,
        url: link?.href || null,
      };
    });

    const fromAnchors = Array.from(document.querySelectorAll('a[href]'))
      .filter((anchor) => /parts-list|diagram|model-section/i.test(anchor.getAttribute('href') || ''))
      .map((anchor) => ({
        name: clean(anchor.textContent) || clean(anchor.querySelector('img')?.getAttribute('alt')),
        url: anchor.href,
      }));

    return [...fromCards, ...fromAnchors].filter((item) => item.name && item.url && !item.url.includes('#'));
  });

  const modelHost = new URL(modelUrl).hostname;
  const byUrl = new Map();

  for (const diagram of diagrams) {
    const url = absoluteUrl(diagram.url, modelUrl);
    if (!url) continue;
    try {
      if (new URL(url).hostname !== modelHost) continue;
      byUrl.set(url, {
        name: cleanText(diagram.name).replace(/\s+Parts$/i, ' Parts') || 'Diagram',
        url,
      });
    } catch {
      // Ignore malformed links.
    }
  }

  return [...byUrl.values()];
}

async function extractRenderedParts(page, sectionName, sectionUrl) {
  return page.evaluate(({ sectionName, sectionUrl }) => {
    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function parseAlt(alt) {
      const text = clean(alt);
      const match = text.match(/^(.*?)\s+(?:[\u2013\u2014-])\s+Part Number:\s*([A-Z0-9-]+)$/i);
      if (!match) return null;
      return {
        rawPartName: clean(match[1]),
        rawPartNumber: clean(match[2]).toUpperCase(),
      };
    }

    function parsePartNumber(text) {
      const labeled = clean(text).match(/(?:Part\s*(?:Number|No\.?|#)?|Item\s*#)\s*:?\s*([A-Z0-9-]{4,})/i);
      return labeled?.[1]?.toUpperCase() || null;
    }

    const rows = [];

    Array.from(document.querySelectorAll('a[href*="/part"], a[href*="/parts"]')).forEach((anchor) => {
      const img = anchor.querySelector('img[alt*="Part"]') || anchor.querySelector('img');
      const parsed = parseAlt(img?.getAttribute('alt') || '');
      const text = clean(anchor.textContent);
      const rawPartNumber = parsed?.rawPartNumber || parsePartNumber(text);
      const rawPartName = parsed?.rawPartName || text.replace(/Part\s*(?:Number|No\.?|#)?\s*:?\s*[A-Z0-9-]{4,}/i, '').trim();

      if (!rawPartNumber || !rawPartName) return;

      const href = anchor.href || sectionUrl;
      const fixId = href.match(/\/(fix\d+)\//i)?.[1]?.toLowerCase() || null;

      rows.push({
        source: 'fix.com',
        sectionName,
        sectionUrl,
        rawPartNumber,
        rawPartName,
        rawCategory: sectionName,
        providerItemId: fixId,
        quantity: null,
        substitutePartNumber: null,
        serialNote: null,
        evidenceUrl: href,
        rawPayload: {
          extraction: 'rendered-dom',
          href,
          imageAlt: img?.getAttribute('alt') || null,
          imageUrl: img?.currentSrc || img?.src || null,
        },
      });
    });

    return rows;
  }, { sectionName, sectionUrl });
}

async function extractPartsWithGemini(page, context) {
  const { sectionName, sectionUrl, brand, modelName, productType, visualTruth } = context;
  if (!process.env.GEMINI_API_KEY) return [];

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: process.env.BROWSER_AGENT_GEMINI_MODEL || 'gemini-3-flash-preview',
  });

  const html = await page.content();
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .substring(0, 40000);

  const visualSupervisorContext = visualTruth ? `
VISUAL SUPERVISOR (Encompass):
- Canon URL: ${visualTruth.canonUrl}
- Expected Total Parts: ${visualTruth.expectedTotal || 'unknown'}
- Canonical Assemblies: ${visualTruth.assemblyNames?.join(', ') || 'unknown'}
` : '';

  const targetLabel = `${brand || 'Unknown'} ${productType || 'Appliance'} ${modelName} Parts List`;
  const prompt = `
You are a high-efficiency data extraction agent. Your goal is to parse the provided URL and return a deterministic JSON Bill of Materials (BOM).
Evaluation Criteria:
Accuracy: Part numbers must exactly match the manufacturer OEM.
Completeness: Do not stop until all parts on the page are indexed.
Format: Output must be valid JSON without conversational filler.
Handling Complexity: If a part is listed as "No longer available," mark the price as null but keep the part record.
User Prompt:
Target: ${targetLabel} as an example it will populate differently
Extract the following schema for every part found:
{
"part_name": "string",
"oem_number": "string",
"price": "number/null",
"status": "string"
}
Use Python to simulate a crawl of the page structure and print the final JSON to the console.
Sort the final JSON alphabetically by part_name before outputting.

Page Context:
Context: Brand: ${brand}, Model: ${modelName}, Section: ${sectionName}.
${visualSupervisorContext}
HTML:
${cleanHtml}
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/)?.[0];
    if (!match) return [];
    
    const data = JSON.parse(match);
    const rows = [];

    const flatParts = Array.isArray(data.parts) ? data.parts : [];
    const nestedParts = Array.isArray(data.systems)
      ? data.systems.flatMap((system) =>
          Array.isArray(system.parts_list)
            ? system.parts_list.map((item) => ({
                ...item,
                _section_name: system.system_name || sectionName,
              }))
            : [],
        )
      : [];

    const sourceParts = flatParts.length > 0 ? flatParts : nestedParts;

    for (const item of sourceParts) {
      const rawPartName = cleanText(item.part_name || item.description || item.name);
      const rawPartNumber = cleanText(item.oem_number || item.oem_part_number || item.partNumber || item.part_number);
      if (!rawPartName || !rawPartNumber) continue;

      rows.push({
        source: 'fix.com',
        sectionName: item._section_name || sectionName,
        sectionUrl,
        rawPartNumber,
        rawPartName,
        rawCategory: item._section_name || sectionName,
        diagramRef: null,
        quantity: item.quantity || item.estimated_quantity || null,
        evidenceUrl: sectionUrl,
        price: item.price ?? null,
        status: item.status || null,
        rawPayload: {
          extraction: 'gemini-flat-json',
          original_row: item,
        },
      });
    }

    return sortPartsByName(rows);
  } catch (err) {
    console.error(`[Gemini] Systematic extraction failed for ${sectionName}:`, err.message);
    return [];
  }
}

function toIngestRow(part, model) {
  return {
    canonical_model: normalizeModel(model),
    source: 'fix.com',
    section_name: cleanText(part.sectionName || part.section || 'General Assembly') || 'General Assembly',
    diagram_ref: part.diagramRef || null,
    provider_item_id: part.providerItemId || null,
    raw_part_number: cleanText(part.rawPartNumber || part.partNumber).toUpperCase(),
    raw_part_name: cleanText(part.rawPartName || part.partName || part.description),
    raw_category: cleanText(part.rawCategory || part.sectionName || 'General Assembly') || 'General Assembly',
    quantity: part.quantity ? String(part.quantity) : null,
    substitute_part_number: part.substitutePartNumber || null,
    serial_note: part.serialNote || null,
    raw_payload: part.rawPayload || part,
  };
}

async function persistRawRows(model, parts) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when --write is used.');
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = parts.map((part) => toIngestRow(part, model)).filter((row) => row.raw_part_number);
  if (rows.length === 0) return { insertedCount: 0, attemptedCount: 0 };

  await sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS payload (
        canonical_model text,
        source text,
        section_name text,
        diagram_ref text,
        provider_item_id text,
        raw_part_number text,
        raw_part_name text,
        raw_category text,
        quantity text,
        substitute_part_number text,
        serial_note text,
        raw_payload jsonb
      )
    )
    INSERT INTO model_parts_raw (
      canonical_model,
      source,
      section_name,
      diagram_ref,
      provider_item_id,
      raw_part_number,
      raw_part_name,
      raw_category,
      quantity,
      substitute_part_number,
      serial_note,
      raw_payload
    )
    SELECT
      canonical_model,
      source,
      section_name,
      diagram_ref,
      provider_item_id,
      raw_part_number,
      raw_part_name,
      raw_category,
      quantity,
      substitute_part_number,
      serial_note,
      raw_payload
    FROM incoming
    ON CONFLICT DO NOTHING;
  `;

  return { insertedCount: rows.length, attemptedCount: rows.length };
}

async function saveArtifact(result) {
  const artifactsDir = path.join(__dirname, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });
  const safeModel = normalizeModel(result.model || 'UNKNOWN') || 'UNKNOWN';
  const filename = `fix-com-${safeModel}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const artifactPath = path.join(artifactsDir, filename);
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return artifactPath;
}

function normalizeRunOptions(modelUrlOrOptions, maybeModelName) {
  if (typeof modelUrlOrOptions === 'string') {
    return {
      modelUrl: modelUrlOrOptions,
      model: maybeModelName,
      write: true,
      useGemini: true,
      headless: true,
    };
  }

  return {
    modelUrl: modelUrlOrOptions.modelUrl || null,
    model: modelUrlOrOptions.model || null,
    brand: modelUrlOrOptions.brand || null,
    productType: modelUrlOrOptions.productType || null,
    write: Boolean(modelUrlOrOptions.write),
    useGemini: Boolean(modelUrlOrOptions.useGemini),
    useReviewer: Boolean(modelUrlOrOptions.useReviewer),
    headless: modelUrlOrOptions.headless !== false,
    visualTruth: modelUrlOrOptions.visualTruth || null,
  };
}

/**
 * Fix.com browser extraction agent.
 *
 * Deterministic order:
 * 1. Render model page and capture JSON/XHR rows.
 * 2. Discover diagram links from rendered DOM.
 * 3. Visit every diagram and parse DOM rows.
 * 4. Optionally run Gemini fallback only when a section has no deterministic rows.
 * 5. Save an audit artifact and optionally write raw rows to Neon.
 */
export async function runFixComAgent(modelUrlOrOptions, maybeModelName) {
  const options = normalizeRunOptions(modelUrlOrOptions, maybeModelName);
  const model = normalizeModel(options.model);
  const modelUrl = options.modelUrl || buildFixModelUrl({
    brand: options.brand,
    productType: options.productType,
    model,
  });

  console.log(`[FixComAgent] Starting rendered extraction for ${model || modelUrl}`);

  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1200 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const collector = createResponseCollector();
  collector.attach(page);

  const evidence = {
    modelUrl,
    capturedApiUrls: [],
    sectionUrls: [],
    countEvidence: null,
  };

  let expectedPartsTotal = null;
  const allParts = [];

  try {
    collector.setContext({ sectionName: 'Model Page', sourceUrl: modelUrl });
    await gotoRendered(page, modelUrl);
    await clickViewMoreUntilSettled(page);

    const count = await parseCountFromPage(page);
    expectedPartsTotal = count?.totalPartsAvailable || null;
    evidence.countEvidence = count?.evidence || null;

    console.log(
      `[Phase 1] Target count: ${expectedPartsTotal || 'unknown'}${evidence.countEvidence ? ` (${evidence.countEvidence})` : ''}`,
    );

    const diagrams = await collectDiagramLinks(page, modelUrl);
    evidence.sectionUrls = diagrams.map((diagram) => ({ sectionName: diagram.name, url: diagram.url }));
    console.log(`[Phase 2] Discovered ${diagrams.length} rendered diagram sections.`);

    const targets = diagrams.length > 0
      ? diagrams
      : [{ name: 'All Model Parts', url: modelUrl }];

    for (const diagram of targets) {
      console.log(`[Phase 3] Extracting ${diagram.name}`);
      collector.setContext({ sectionName: diagram.name, sourceUrl: diagram.url });

      if (diagram.url !== page.url()) {
        await gotoRendered(page, diagram.url);
        await clickViewMoreUntilSettled(page);
      }

      const renderedRows = await extractRenderedParts(page, diagram.name, diagram.url);
      allParts.push(...renderedRows);

      if (options.useGemini && renderedRows.length === 0) {
        const fallbackRows = await extractPartsWithGemini(page, {
          sectionName: diagram.name,
          sectionUrl: diagram.url,
          brand: options.brand,
          modelName: model,
          productType: options.productType,
          visualTruth: options.visualTruth
        });
        allParts.push(...fallbackRows);
      }

      console.log(`[Phase 3] ${diagram.name}: ${renderedRows.length} deterministic rows.`);
    }

    allParts.push(...collector.rows());
    evidence.capturedApiUrls = collector.urls();

    const uniqueParts = dedupeParts(allParts);
    const cove = verifyBomCompleteness({
      parts: uniqueParts,
      targetCount: expectedPartsTotal,
      applianceType: options.productType,
    });

    console.log(
      `[Phase 4] CoVe Check: Extracted ${cove.extractedCount} / Target ${cove.targetCount || 'unknown'}. Status: ${cove.status}`,
    );

    const review = await runCoveReviewer({
      model,
      applianceType: options.productType,
      expectedPartsTotal,
      parts: uniqueParts,
      cove,
      useGemini: options.useReviewer,
    });

    const result = {
      provider: 'fix.com',
      model,
      modelUrl,
      expectedPartsTotal,
      expectedPartsSource: expectedPartsTotal ? 'fix.com' : null,
      sectionsDiscovered: targets.map((target) => target.name),
      parts: uniqueParts,
      cove,
      review,
      evidence,
      persisted: null,
    };

    result.artifactPath = await saveArtifact(result);

    if (options.write) {
      result.persisted = await persistRawRows(model, uniqueParts);
    }

    return result;
  } finally {
    await browser.close();
  }
}
