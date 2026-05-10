import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Searching for WE12X21574 on Fix.com...');
  await page.goto('https://www.fix.com/parts/search/?SearchTerm=WE12X21574', { waitUntil: 'networkidle' });

  const content = await page.content();
  console.log('Search Result Content Length:', content.length);
  
  const found = content.includes('WE12X21574');
  console.log('Found WE12X21574 in search results:', found);
  
  if (found) {
    const partName = await page.locator('.part-name, h1').first().innerText().catch(() => 'Unknown');
    console.log('Part Name:', partName);
    
    // Check if it's compatible with HTDX100ED3WW
    await page.goto(`https://www.fix.com/parts/search/compatibility/?SearchTerm=HTDX100ED3WW&PartNum=WE12X21574`, { waitUntil: 'networkidle' }).catch(() => {});
    const compContent = await page.content();
    console.log('Compatible with model:', compContent.includes('Compatible') || compContent.includes('HTDX100ED3WW'));
  }

  await browser.close();
}

run().catch(console.error);
