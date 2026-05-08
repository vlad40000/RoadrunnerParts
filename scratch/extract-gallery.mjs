import fs from 'fs';
import https from 'https';

const part = process.argv[2] || 'we21x20562';
const url = `https://www.reliableparts.com/gen-${part}.html`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const match = data.match(/"data":\s*(\[.*?\])/);
    if (match) {
      try {
        console.log(match[1]);
      } catch (e) {
        console.log('Error parsing JSON');
      }
    } else {
      console.log('No gallery data found');
    }
  });
}).on('error', (err) => {
  console.error(err.message);
});
