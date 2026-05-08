async function debugReliable() {
  const part = 'WE17X22217';
  const url = `https://www.reliableparts.com/gen-${part.toLowerCase()}.html`;
  console.log(`Fetching ${url}...`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  
  // Look for JSON blocks
  const galleryRegex = /data-role=["']gallery-placeholder["'][\s\S]*?\{([\s\S]*?)\}/g;
  let match;
  while ((match = galleryRegex.exec(html)) !== null) {
      console.log('Found gallery-placeholder JSON match');
      try {
          const jsonStr = '{' + match[1] + '}';
          const data = JSON.parse(jsonStr);
          if (data['mage/gallery/gallery']?.data) {
              console.log('Found gallery data array:', data['mage/gallery/gallery'].data.length);
              data['mage/gallery/gallery'].data.forEach((img, i) => {
                  console.log(`Image ${i+1}:`, img.full);
              });
          }
      } catch (e) {
          console.error('JSON parse failed', e.message);
      }
  }
}

debugReliable();
