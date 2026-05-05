import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('Creating missing tables for BOM Hardening Phase 2...\n');

  try {
    // 1) bom_telemetry
    await sql`
      CREATE TABLE IF NOT EXISTS bom_telemetry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id TEXT,
        event TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        brand TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_job_id_idx ON bom_telemetry (job_id);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_created_at_idx ON bom_telemetry (created_at DESC);`;
    console.log(' ✓ bom_telemetry');

    // 2) model_diagram_manifest
    await sql`
      CREATE TABLE IF NOT EXISTS model_diagram_manifest (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        normalized_model TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT NOT NULL,
        trusted_total_part_count INTEGER,
        manifest_row_count INTEGER NOT NULL DEFAULT 0,
        required_manifest_row_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'discovered',
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        checked_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log(' ✓ model_diagram_manifest');

    // 3) diagram_section
    await sql`
      CREATE TABLE IF NOT EXISTS diagram_section (
        id BIGSERIAL PRIMARY KEY,
        manifest_id UUID NOT NULL REFERENCES model_diagram_manifest(id) ON DELETE CASCADE,
        section_name TEXT NOT NULL,
        section_original TEXT,
        section_url TEXT,
        section_key TEXT,
        section_order INTEGER,
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(manifest_id, section_name, section_url)
      );
    `;
    console.log(' ✓ diagram_section');

    // 4) diagram_manifest_row
    await sql`
      CREATE TABLE IF NOT EXISTS diagram_manifest_row (
        id BIGSERIAL PRIMARY KEY,
        manifest_id UUID NOT NULL REFERENCES model_diagram_manifest(id) ON DELETE CASCADE,
        section_id BIGINT REFERENCES diagram_section(id) ON DELETE SET NULL,
        normalized_model TEXT NOT NULL,
        diagram_key TEXT NOT NULL,
        callout TEXT,
        expected_part_number TEXT,
        expected_part_name TEXT,
        quantity INTEGER DEFAULT 1,
        row_type TEXT NOT NULL DEFAULT 'required',
        is_required BOOLEAN NOT NULL DEFAULT true,
        source_url TEXT NOT NULL,
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(manifest_id, diagram_key, expected_part_number, callout)
      );
    `;
    console.log(' ✓ diagram_manifest_row');

    // 5) bom_part_mapping
    await sql`
      CREATE TABLE IF NOT EXISTS bom_part_mapping (
        id BIGSERIAL PRIMARY KEY,
        normalized_model TEXT NOT NULL,
        manifest_row_id BIGINT NOT NULL REFERENCES diagram_manifest_row(id) ON DELETE CASCADE,
        bom_part_id BIGINT, -- No FK here if table name mismatch persists, using BIGINT for safety
        expected_part_number TEXT,
        found_part_number TEXT,
        mapping_status TEXT NOT NULL,
        mapping_confidence REAL,
        evidence_source TEXT,
        evidence_url TEXT,
        checked_at TIMESTAMPTZ DEFAULT NOW(),
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE(manifest_row_id, bom_part_id, mapping_status)
      );
    `;
    console.log(' ✓ bom_part_mapping');

    // 6) agent_preset
    await sql`
      CREATE TABLE IF NOT EXISTS agent_preset (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        scenario_type TEXT,
        is_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log(' ✓ agent_preset');

    console.log('\n✅ All missing tables created successfully.');
  } catch (err) {
    console.error('❌ Table creation failed:', err);
    process.exit(1);
  }
}

run();
