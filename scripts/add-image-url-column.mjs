import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log('Adding image_url to nameplate_extractions...');
  try {
    await sql`
      ALTER TABLE nameplate_extractions 
      ADD COLUMN IF NOT EXISTS image_url text;
    `;
    console.log('✅ Migration successful: image_url column added.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
