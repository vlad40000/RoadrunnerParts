// Using native fetch

async function debugGallery() {
  const url = 'https://www.reliableparts.com/gen-we17x22217.html';
  console.log(`Fetching ${url}...`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  
  const altMatch = html.match(/\"images\":\s*(\[[\s\S]*?\])/);
  if (altMatch) {
    console.log('Found "images" array!');
    try {
      const images = JSON.parse(altMatch[1]);
      console.log('Images count:', images.length);
      images.forEach((img, i) => {
        console.log(`Image ${i+1}:`, JSON.stringify(img));
      });
    } catch (e) {
      console.error('JSON parse error');
    }
  } else {
    console.log('No image data found in HTML.');
  }
}

debugGallery();
