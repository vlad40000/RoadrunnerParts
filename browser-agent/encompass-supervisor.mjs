import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(__dirname, 'artifacts');

function cleanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Encompass Visual Supervisor
 * Captures the "Visual Truth" artifact from Encompass exploded-view pages.
 */
export async function runEncompassSupervisor(options = {}) {
  const { model, url, headless = true } = options;

  if (!model && !url) {
    throw new Error('Model number or Encompass URL is required for supervisor.');
  }

  console.log(`[Supervisor] Initializing Visual Truth for ${model || url}`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1200 },
  });

  const page = await context.newPage();
  const targetUrl = url || `https://encompass.com/search?searchTerm=${model}`;

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Handle search results if we landed on a search page
    if (page.url().includes('/search')) {
      const firstModelLink = await page.locator('a[href*="/model/"]').first();
      if (await firstModelLink.isVisible()) {
        await firstModelLink.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    // Ensure we are on an exploded-view or model page
    // (Encompass often has a "Exploded View" button or section)
    const explodedViewLink = await page.locator('a:has-text("Exploded View"), a[href*="/exploded-view-assembly/"]').first();
    if (await explodedViewLink.isVisible()) {
        // If there are multiple, we might be on a landing page.
        // For the supervisor, we want the "Overview" which shows all assemblies.
    }

    // Capture "Assembly Overview Screenshot"
    await mkdir(artifactsDir, { recursive: true });
    const safeModel = (model || 'unknown').toUpperCase().replace(/[^A-Z0-9]/g, '-');
    const screenshotName = `visual-truth-${safeModel}-${Date.now()}.png`;
    const screenshotPath = path.join(artifactsDir, screenshotName);
    
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const screenshotBuffer = await page.screenshot();
    const screenshotBase64 = screenshotBuffer.toString('base64');

    // Extract Metadata
    const content = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    
    const expectedTotalMatch = text.match(/(\d+)\s+Part Count/i) || text.match(/Found\s+(\d+)\s+parts/i);
    const expectedTotal = expectedTotalMatch ? parseInt(expectedTotalMatch[1], 10) : null;

    const assemblyNames = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/exploded-view-assembly/"]'));
      return links
        .map(l => l.innerText.trim())
        .filter(t => t && !t.toLowerCase().includes('view all'))
        .filter((v, i, a) => a.indexOf(v) === i); // Unique
    });

    const result = {
      model: model || safeModel,
      canonUrl: page.url(),
      screenshotPath,
      screenshotBase64: `data:image/png;base64,${screenshotBase64}`,
      expectedTotal,
      assemblyNames,
      timestamp: new Date().toISOString(),
    };

    const artifactFilename = `visual-truth-${safeModel}.json`;
    await writeFile(path.join(artifactsDir, artifactFilename), JSON.stringify(result, null, 2));

    console.log(`[Supervisor] Visual Truth captured: ${assemblyNames.length} assemblies, ${expectedTotal || 'unknown'} parts.`);
    return result;

  } finally {
    await browser.close();
  }
}

// CLI support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modelArg = process.argv.find(a => a.startsWith('--model='))?.split('=')[1];
  const urlArg = process.argv.find(a => a.startsWith('--url='))?.split('=')[1];
  
  runEncompassSupervisor({ model: modelArg, url: urlArg, headless: !process.argv.includes('--headful') })
    .then(res => console.log(JSON.stringify(res, null, 2)))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
