import * as cheerio from 'cheerio';

export async function scrapeEbayActive(partNumber) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}&_sacat=0&LH_TitleDesc=0&_osacat=0&_odkw=${encodeURIComponent(partNumber)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const listings = [];
  $('.s-item__wrapper').each((i, el) => {
    const title = $(el).find('.s-item__title').text();
    if (title.includes('Shop on eBay')) return; // Skip dummy item
    
    const priceText = $(el).find('.s-item__price').text();
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
    
    const shippingText = $(el).find('.s-item__shipping').text();
    const shipping = parseFloat(shippingText.replace(/[^0-9.]/g, '')) || 0;
    
    const itemUrl = $(el).find('.s-item__link').attr('href');
    
    listings.push({ title, price, shipping, itemUrl });
  });
  
  return listings;
}

export async function scrapeEbaySold(partNumber) {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(partNumber)}&_sacat=0&LH_TitleDesc=0&LH_Sold=1&LH_Complete=1&_osacat=0&_odkw=${encodeURIComponent(partNumber)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const listings = [];
  $('.s-item__wrapper').each((i, el) => {
    const title = $(el).find('.s-item__title').text();
    if (title.includes('Shop on eBay')) return;
    
    const priceText = $(el).find('.s-item__price').text();
    const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
    
    const shippingText = $(el).find('.s-item__shipping').text();
    const shipping = parseFloat(shippingText.replace(/[^0-9.]/g, '')) || 0;
    
    const soldDate = $(el).find('.s-item__title--tagblock .POSITIVE').text();
    const itemUrl = $(el).find('.s-item__link').attr('href');
    
    listings.push({ title, price, shipping, soldDate, itemUrl });
  });
  
  return listings;
}
