const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function testConnection() {
  const urls = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL_UNPOOLED
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const sql = neon(url);
      console.log('Testing connection to:', url.replace(/:[^:@]+@/, ':***@'));
      const rows = await sql`SELECT current_user, current_database()`;
      console.log('Successfully connected to Neon Database');
      console.log('User:', rows[0].current_user);
      return;
    } catch (err) {
      console.error('Connection failed for', url.split('@')[1], ':', err.message);
    }
  }
  process.exit(1);
}

testConnection();
