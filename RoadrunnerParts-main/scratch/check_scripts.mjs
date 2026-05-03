import { readFileSync } from 'fs';
import { load } from 'cheerio';

const htmlPath = 'C:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (21)\\RoadrunnerParts-main\\captures\\encompass\\MED3500FW0\\rendered-aHR0cHM6Ly9lbmNv-1777827174530.html';
const html = readFileSync(htmlPath, 'utf8');
const $ = load(html);

console.log(`Scripts found: ${$('script').length}`);
$('script').each((i, script) => {
    const src = $(script).attr('src');
    const content = $(script).html() || '';
    if (src) {
        console.log(`Script ${i} src: ${src}`);
    } else {
        console.log(`Script ${i} content sample: ${content.slice(0, 100)}...`);
    }
});
