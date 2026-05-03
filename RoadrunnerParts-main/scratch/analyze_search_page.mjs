import { readFileSync } from 'fs';
import { load } from 'cheerio';
import path from 'path';

const htmlPath = 'C:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (21)\\RoadrunnerParts-main\\captures\\encompass\\MED3500FW0\\rendered-aHR0cHM6Ly9lbmNv-1777826983636.html';
const html = readFileSync(htmlPath, 'utf8');
const $ = load(html);

console.log("Title:", $('title').text());

// Look for links that might be model pages
const links = [];
$('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('/model/') || href.includes('/search'))) {
        links.push({ href, text });
    }
});

console.log("Model Links found:", links.filter(l => l.href.includes('/model/')));

// Check for the "Part Number" table pattern
const tables = [];
$('table').each((i, el) => {
    const headers = $(el).find('th,td').map((j, cell) => $(cell).text().trim().toLowerCase()).get();
    tables.push({ index: i, headers: headers.slice(0, 10) });
});

console.log("Tables found:", tables.length);
tables.forEach(t => {
    console.log(`Table ${t.index} headers:`, t.headers.join(' | '));
});
