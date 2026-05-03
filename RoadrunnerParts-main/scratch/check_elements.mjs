import { readFileSync } from 'fs';
import { load } from 'cheerio';

const htmlPath = 'C:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (21)\\RoadrunnerParts-main\\captures\\encompass\\MED3500FW0\\rendered-aHR0cHM6Ly9lbmNv-1777827174530.html';
const html = readFileSync(htmlPath, 'utf8');
const $ = load(html);

console.log(`Tables found: ${$('table').length}`);
$('table').each((i, table) => {
    console.log(`Table ${i} text: ${$(table).text().slice(0, 100)}...`);
});

console.log(`Div rows found: ${$('[role="row"]').length}`);
$('[role="row"]').each((i, row) => {
    console.log(`Row ${i} text: ${$(row).text().slice(0, 100)}...`);
});
