import { db } from './src/server/db/index';
import { modelPartsCache } from './src/server/db/schema/model-parts-cache';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    const results = await db.select().from(modelPartsCache).where(sql`parts::text ilike '%immigrationadvocates%'`);
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
