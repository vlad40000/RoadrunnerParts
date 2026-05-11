import * as cheerio from 'cheerio';

async function fetchEbaySearchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const html = await response.text();
  const lower = html.toLowerCase();

  if (!response.ok || lower.includes('access denied') || lower.includes('captcha')) {
    throw new Error(`eBay search fetch blocked or failed: HTTP ${response.status}`);
  }

  return html;
}

function parseSearchResults(html: string, includeSoldDate = false) {
  const $ = cheerio.load(html);
  const listings = [];
  const items = $('li.s-item').length ? $('li.s-item') : $('.s-item__wrapper');

  items.each((i, el) => {
    const title = $(el).find('.s-item__title').text();
    if (!title || title.includes('Shop on eBay')) return;

    const priceText = $(el).find('.s-item__price').text();
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

    const shippingText = $(el).find('.s-item__shipping').text();
    const shipping = parseFloat(shippingText.replace(/[^0-9.]/g, '')) || 0;

    const itemUrl = $(el).find('.s-item__link').attr('href');
    const listing: Record<string, unknown> = { title, price, shipping, itemUrl };

    if (includeSoldDate) {
      listing.soldDate = $(el).find('.s-item__title--tagblock .POSITIVE').text();
    }

    listings.push(listing);
  });

  return listings;
}

export async function scrapeEbayActive(partNumber) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}&_sacat=0&LH_TitleDesc=0&_osacat=0&_odkw=${encodeURIComponent(partNumber)}`;
  return parseSearchResults(await fetchEbaySearchHtml(url));
}

export async function scrapeEbaySold(partNumber) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}&_sacat=0&LH_TitleDesc=0&LH_Sold=1&LH_Complete=1&_osacat=0&_odkw=${encodeURIComponent(partNumber)}`;
  return parseSearchResults(await fetchEbaySearchHtml(url), true);
}
