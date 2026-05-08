// Using native fetch

async function debugGE() {
  const part = 'WE17X22217';
  const url = `https://www.geapplianceparts.com/store/parts/spec/${part}`;
  console.log(`Fetching ${url}...`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  
  console.log('HTML Length:', html.length);
  console.log('Includes Part Number:', html.toUpperCase().includes(part.toUpperCase()));
  
  const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  console.log('OG Image Match:', ogImage ? ogImage[1] : 'None');
  
  const imgRegex = /data-fullurl=["']([^"']+)["']/g;
  let match;
  let count = 0;
  while ((match = imgRegex.exec(html)) !== null) {
    count++;
    console.log(`Gallery Image ${count}:`, match[1]);
  }
  
  if (count === 0) {
      console.log('No data-fullurl found. Searching for other image patterns...');
      const otherImgs = html.match(/src=["']([^"']+\.(jpg|png|webp|gif))["']/gi);
      console.log('Found generic images:', otherImgs?.length || 0);
  }
}

debugGE();
