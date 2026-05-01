import { sql } from '../lib/db.js';

async function migrate() {
  console.log('Creating search_sessions table...');
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS search_sessions (
        id UUID PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        request_json JSONB NOT NULL,
        stage TEXT NOT NULL,
        has_more BOOLEAN NOT NULL,
        next_stage TEXT,
        status TEXT,
        canonical_model TEXT,
        serial_profile_json JSONB,
        retrieval_trace_json JSONB,
        accumulated_raw_parts_json JSONB,
        accumulated_sources_json JSONB,
        last_payload_json JSONB,
        cache_status TEXT,
        identity_json JSONB,
        route_json JSONB,
        variant_json JSONB,
        review_json JSONB
      );
    `;
    
    await sql`CREATE INDEX IF NOT EXISTS idx_search_sessions_expires_at ON search_sessions(expires_at);`;
    
    console.log('Migration successful: search_sessions table created.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
