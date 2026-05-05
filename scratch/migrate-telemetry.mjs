import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('Adding system_prompt column to bom_telemetry...');
  try {
    await sql`ALTER TABLE bom_telemetry ADD COLUMN IF NOT EXISTS system_prompt TEXT;`;
    console.log('✅ Success');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
}

run();
