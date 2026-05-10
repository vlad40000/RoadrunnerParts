import { chromium } from 'playwright';

const missingParts = [
  "WE21X20407", "WE10X20418", "WE18M28", "WE12X21574", "WE13X30697",
  "WD21X557", "WH2M270", "WE09X20441", "WE3M51", "WE1M1101",
  "WE3M52", "WE12X20395", "WE1M966", "WE1M536", "WE1M505",
  "WZ05X0158", "WE00X1811"
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to Fix.com...');
  await page.goto('https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/', { waitUntil: 'networkidle' });

  // Click "View More" if it exists
  let viewMoreFound = true;
  while (viewMoreFound) {
    const viewMore = page.locator('text=/View More/i').first();
    if (await viewMore.isVisible()) {
      console.log('Clicking View More...');
      await viewMore.click();
      await page.waitForTimeout(2000);
    } else {
      viewMoreFound = false;
    }
  }

  const results = [];
  
  for (const partNum of missingParts) {
    console.log(`Searching for ${partNum}...`);
    const partElement = page.locator(`text=${partNum}`).first();
    if (await partElement.isVisible()) {
      // Find the container for this part
      const container = page.locator('.js-mega-m-part, .mega-m__part').filter({ hasText: partNum }).first();
      const partName = await container.locator('.mega-m__part__name').innerText().catch(() => 'Unknown');
      const price = await container.locator('.price').innerText().catch(() => 'Unknown');
      const section = 'Model Page'; // Or determine from surrounding context
      
      results.push({
        partNumber: partNum,
        partName,
        price,
        section,
        found: true
      });
      console.log(`Found ${partNum}: ${partName} - ${price}`);
    } else {
      results.push({ partNumber: partNum, found: false });
    }
  }

  // Also check individual sections if not found
  const sections = await page.locator('a[href*="/section/"]').all();
  const sectionUrls = [];
  for (const s of sections) {
    const url = await s.getAttribute('href');
    const name = await s.innerText();
    if (url) sectionUrls.push({ name, url: new URL(url, page.url()).toString() });
  }

  for (const section of sectionUrls) {
    if (results.every(r => r.found)) break;
    
    console.log(`Checking section: ${section.name}...`);
    await page.goto(section.url, { waitUntil: 'networkidle' });
    
    for (const res of results) {
      if (res.found) continue;
      
      const partElement = page.locator(`text=${res.partNumber}`).first();
      if (await partElement.isVisible()) {
        const container = page.locator('.js-mega-m-part, .mega-m__part').filter({ hasText: res.partNumber }).first();
        const partName = await container.locator('.mega-m__part__name').innerText().catch(() => 'Unknown');
        const price = await container.locator('.price').innerText().catch(() => 'Unknown');
        
        res.partName = partName;
        res.price = price;
        res.section = section.name;
        res.found = true;
        console.log(`Found ${res.partNumber} in ${section.name}: ${partName} - ${price}`);
      }
    }
  }

  console.log('Final Results:', JSON.stringify(results, null, 2));
  await browser.close();
}

run().catch(console.error);
