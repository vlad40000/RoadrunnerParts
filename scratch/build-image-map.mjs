/**
 * build-image-map.mjs
 * Parses reliableparts-images.json and produces a clean partNumber → image URL map.
 * 
 * Priority:
 *   1. cdn.amplifi.pattern.com full-res (no _small suffix)
 *   2. static.reliableparts.com with width/height rewritten to 800
 *   3. cdn.amplifi.pattern.com _small (thumbnails only)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, 'reliableparts-images.json');
const outputPath = join(__dirname, 'listing-image-map.json');

const data = JSON.parse(readFileSync(inputPath, 'utf-8'));
const imageMap = {};

for (const entry of data.images) {
  const pn = entry.partNumber;
  if (!pn) continue;

  const fullRes = [];    // cdn.amplifi without _small
  const staticHiRes = []; // static.reliableparts rewritten to 800px
  const thumbs = [];      // cdn.amplifi _small

  for (const c of entry.candidates) {
    const url = c.imageUrl;
    if (!url) continue;

    if (url.includes('cdn.amplifi.pattern.com')) {
      if (url.includes('_small')) {
        thumbs.push(url);
      } else {
        fullRes.push(url);
      }
    } else if (url.includes('static.reliableparts.com')) {
      // Rewrite query params to 800x800 for eBay compliance (min 500px)
      const rewritten = url
        .replace(/width=\d+/, 'width=800')
        .replace(/height=\d+/, 'height=800');
      staticHiRes.push(rewritten);
    }
  }

  // Deduplicate by base URL (before query params)
  const dedup = (arr) => {
    const seen = new Set();
    return arr.filter(u => {
      const base = u.split('?')[0];
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });
  };

  const dedupedFull = dedup(fullRes);
  const dedupedStatic = dedup(staticHiRes);
  const dedupedThumbs = dedup(thumbs);

  // Pick main image: prefer full-res CDN, then static hi-res
  const mainImage = dedupedFull[0] || dedupedStatic[0] || null;
  
  // Pick thumbnails: remaining full-res + static, up to 4
  const allExtras = [
    ...dedupedFull.slice(mainImage === dedupedFull[0] ? 1 : 0),
    ...dedupedStatic.slice(mainImage === dedupedStatic[0] ? 1 : 0),
    ...dedupedThumbs
  ].slice(0, 4);

  if (mainImage) {
    imageMap[pn] = {
      mainImage,
      thumbnails: allExtras,
      source: entry.source,
      reviewStatus: entry.reviewStatus
    };
  }
}

// Stats
const total = Object.keys(imageMap).length;
const withThumbs = Object.values(imageMap).filter(v => v.thumbnails.length > 0).length;

const output = {
  generatedAt: new Date().toISOString(),
  stats: { partsWithImages: total, partsWithThumbnails: withThumbs },
  imageSelectionPolicy: "Priority: cdn.amplifi full-res > static.reliableparts 800px > cdn.amplifi _small",
  ebayCompliance: "All main images >= 500px on at least one side",
  map: imageMap
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Image map built: ${total} parts with images, ${withThumbs} with thumbnails`);
console.log(`Output: ${outputPath}`);
