import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '.env.local' });
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-3.1-flash-lite-preview',
  tools: [{ googleSearch: {} }] 
});

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }),
);

const inputPath = String(args.get('input') || 'scratch/ebay-html/listings.normalized.json');
const limit = args.has('limit') ? Number(args.get('limit')) : null;

async function findImageUrl(partNumber, title) {
  const prompt = `Use Google Search to find the direct product image URL for this appliance part:
Part Number: ${partNumber}
Title: ${title}

Instructions:
1. Find a high-quality product image from a reputable site (GE, Whirlpool, Amazon, Encompass, RepairClinic, eBay).
2. Look for the most direct image URL possible (ending in .jpg, .png, etc).
3. If you can't find a direct .jpg URL, look for a "thumbnail" or "src" attribute in the search result snippets.
4. Return ONLY the URL. If you absolutely cannot find a valid image URL, return "NULL".`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (text.startsWith('http')) return text;
    return null;
  } catch (err) {
    console.error(`Error searching for ${partNumber}:`, err);
    return null;
  }
}

async function main() {
  console.log(`Loading listings from ${inputPath}...`);
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const listings = data.listings || [];
  
  const toProcess = limit ? listings.slice(0, limit) : listings;
  console.log(`Processing ${toProcess.length} listings...`);

  for (let i = 0; i < toProcess.length; i++) {
    const listing = toProcess[i];
    if (listing.imageUrl) {
      console.log(`[${i+1}/${toProcess.length}] Skipping ${listing.partNumber} (already has image)`);
      continue;
    }

    console.log(`[${i+1}/${toProcess.length}] Searching image for ${listing.partNumber}...`);
    const url = await findImageUrl(listing.partNumber, listing.title);
    
    if (url) {
      listing.imageUrl = url;
      console.log(`Found: ${url}`);
    } else {
      console.log(`No image found for ${listing.partNumber}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(inputPath, JSON.stringify({ listings }, null, 2));
  console.log(`\nUpdated ${inputPath} with image URLs.`);
}

main().catch(console.error);
