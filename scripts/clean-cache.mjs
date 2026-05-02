import { sql } from '../lib/db.js';
import 'dotenv/config';

async function cleanup() {
  try {
    console.log('Cleaning up empty part cache entries...');
    // Note: neon() client doesn't return rowCount in the standard way if it's the raw driver, 
    // but the tagged template 'sql' from @neondatabase/serverless does if it's the serverless driver.
    // However, our lib/db.js uses the 'neon()' function which returns the rows directly.
    // To get the row count for a DELETE, we might just need to check the result.
    
    await sql`
      DELETE FROM appliance_parts_cache
      WHERE COALESCE(master_row_count, 0) = 0
         OR COALESCE(raw_row_count, 0) = 0
         OR COALESCE(jsonb_array_length(parts_json), 0) = 0
    `;
    
    console.log('Cleanup complete.');
  } catch (err) {
    console.error('Cleanup failed:', err);
    process.exit(1);
  }
}

cleanup();
