const fs = require('fs');
const path = 'C:/Users/bradv/Downloads/Ebay listings revised 1.txt';
let content = fs.readFileSync(path, 'utf8');

console.log('Original Length:', content.length);

if (!content.trim().endsWith('}')) {
    console.log('Adding missing }');
    content = content.trim() + '\n}';
}

try {
    const data = JSON.parse(content);
    console.log('Parsed successfully.');
    console.log('Listings length:', data.listings.length);
    // Print the last listing part number
    console.log('Last part:', data.listings[data.listings.length - 1].partNumber);
} catch (e) {
    console.log('JSON Parse failed:', e.message);
    // Manual count
    const matches = content.match(/"partNumber":/g);
    console.log('Manual partNumber count:', matches ? matches.length : 0);
}
