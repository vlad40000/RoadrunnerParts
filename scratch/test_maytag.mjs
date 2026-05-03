import { chromium } from 'playwright';

async function testModel() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const model = 'MVWB300WQ2';
  const searchUrl = `https://encompass.com/search?searchTerm=${model}`;
  
  console.log(`Searching for: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'networkidle' });
  
  const content = await page.content();
  console.log(`Page Title: ${await page.title()}`);
  
  // Look for assembly links
  const assemblyLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => a.href.includes('/Exploded-View-Assembly/'))
      .map(a => ({ href: a.href, text: a.innerText }));
  });
  
  console.log('Found Assembly Links:', JSON.stringify(assemblyLinks, null, 2));
  
  await browser.close();
}

testModel().catch(console.error);
