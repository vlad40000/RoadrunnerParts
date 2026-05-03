import { readFileSync } from 'fs';
import { load } from 'cheerio';

const htmlPath = 'C:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (21)\\RoadrunnerParts-main\\captures\\encompass\\MED3500FW0\\rendered-aHR0cHM6Ly9lbmNv-1777826983636.html';
const html = readFileSync(htmlPath, 'utf8');
const $ = load(html);

console.log("Analyzing links...");
$('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && !href.startsWith('javascript') && !href.startsWith('#')) {
        console.log(`Link: ${href} | Text: ${text}`);
    }
});
