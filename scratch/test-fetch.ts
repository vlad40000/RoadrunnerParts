import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import { fetchHtml } from '../src/features/bom/services/providers/utils';

const envPath = resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}

async function test() {
  const url = 'https://www.repairclinic.com/ProductDetail/2678688';
  console.log(`Testing fetch to: ${url}`);
  try {
    const html = await fetchHtml(url);
    console.log(`Success! Fetched ${html.length} characters.`);
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

test();
