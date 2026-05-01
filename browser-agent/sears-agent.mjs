import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupeParts, verifyBomCompleteness } from './cove-verifier.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

function cleanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeModel(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '');
}

async function extractPartsWithGemini(page, context) {
  const { sectionName, sectionUrl, brand, modelName, productType } = context;
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

  const prompt = `
ROLE: Expert Appliance Engineer. Generate 100% complete BOM for ${productType} from HTML. No hallucinations.
CONTEXT: Brand: ${brand}, Model: ${modelName}, Section: ${sectionName}.
STEP-BACK: Identify 4-6 core functional systems.
CoT: 1. List systems. 2. Operational reasoning. 3. Component list (inc. hardware/fasteners).
JSON SCHEMA: { "systems": [{ "system_name": "", "reasoning": "", "parts_list": [{ "part_name": "", "oem_part_number": "", "estimated_quantity": 1, "critical_notes": "" }] }] }
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
    
    (data.systems || []).forEach(system => {
      (system.parts_list || []).forEach(item => {
        rows.push({
          source: 'searspartsdirect.com',
          sectionName: system.system_name || sectionName,
          sectionUrl,
          rawPartNumber: item.oem_part_number || item.partNumber,
          rawPartName: item.part_name || item.description || item.name,
          rawCategory: system.system_name || sectionName,
          diagramRef: null,
          quantity: item.estimated_quantity || item.quantity || null,
          evidenceUrl: sectionUrl,
          rawPayload: {
            extraction: 'gemini-systematic-prompt-sears',
            critical_notes: item.critical_notes || null,
            original_row: item
          },
        });
      });
    });

    return rows;
  } catch (err) {
    console.error(`[Gemini] Systematic extraction failed for ${sectionName}:`, err.message);
    return [];
  }
}

async function persistRawRows(model, parts) {
  if (!process.env.DATABASE_URL) return;
  const sql = neon(process.env.DATABASE_URL);
  const rows = parts.map(p => ({
    canonical_model: normalizeModel(model),
    source: 'searspartsdirect.com',
    section_name: p.sectionName,
    raw_part_number: p.rawPartNumber,
    raw_part_name: p.rawPartName,
    raw_payload: p.rawPayload
  })).filter(r => r.raw_part_number);

  if (rows.length === 0) return;

  await sql`
    INSERT INTO model_parts_raw (
      canonical_model, source, section_name, raw_part_number, raw_part_name, raw_payload
    )
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x (
      canonical_model text, source text, section_name text, raw_part_number text, raw_part_name text, raw_payload jsonb
    )
    ON CONFLICT DO NOTHING;
  `;
}

export async function runSearsAgent(options) {
  const { modelUrl, model, brand, productType, write, useGemini, headless } = options;
  const modelName = normalizeModel(model);
  
  console.log(`[SearsAgent] Starting extraction for ${modelName}...`);
  
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  try {
    console.log(`[Phase 1] Navigating to ${modelUrl}...`);
    await page.goto(modelUrl, { waitUntil: 'networkidle' });
    
    const targetCount = await page.evaluate(() => {
      const el = document.querySelector('.total-parts-count, .parts-found-text');
      return el ? parseInt(el.textContent.match(/(\d+)/)?.[1] || '0', 10) : 0;
    });

    const diagrams = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/diagram/"]')).map(a => ({
        name: a.textContent.trim(),
        url: a.href
      })).filter(d => d.url && !d.url.includes('#'));
    });

    const uniqueDiagrams = Array.from(new Map(diagrams.map(d => [d.url, d])).values());
    let allParts = [];

    for (const diagram of uniqueDiagrams) {
      console.log(`[Phase 3] Extracting ${diagram.name}`);
      await page.goto(diagram.url, { waitUntil: 'networkidle' });
      
      const geminiRows = await extractPartsWithGemini(page, {
        sectionName: diagram.name,
        sectionUrl: diagram.url,
        brand,
        modelName,
        productType
      });
      allParts.push(...geminiRows);
    }

    const uniqueParts = dedupeParts(allParts);
    const cove = verifyBomCompleteness({
      parts: uniqueParts,
      targetCount,
      applianceType: productType
    });

    if (write) {
      await persistRawRows(modelName, uniqueParts);
    }

    return {
      provider: 'searspartsdirect.com',
      model: modelName,
      parts: uniqueParts,
      cove
    };

  } finally {
    await browser.close();
  }
}
