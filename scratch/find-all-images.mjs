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
  
  // Find all occurrences of "images": [
  const regex = /\"images\":\s*\[/g;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null) {
    count++;
    console.log(`Match ${count} at index ${match.index}`);
    const start = match.index;
    let bracketCount = 0;
    let end = -1;
    for (let i = start + match[0].length - 1; i < html.length; i++) {
        if (html[i] === '[') bracketCount++;
        if (html[i] === ']') {
            bracketCount--;
            if (bracketCount === -1) {
                end = i + 1;
                break;
            }
        }
    }
    if (end !== -1) {
        const jsonStr = html.substring(start + match[0].length - 1, end);
        try {
            const images = JSON.parse(jsonStr);
            console.log(`- Images count: ${images.length}`);
            if (images.length > 0) {
                console.log(`- First image: ${JSON.stringify(images[0]).substring(0, 150)}`);
            }
        } catch (e) {
            console.log(`- JSON parse error at match ${count}`);
        }
    }
  }
}

debugGallery();
