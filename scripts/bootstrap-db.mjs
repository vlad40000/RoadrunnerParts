import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const sql = neon(databaseUrl);

/**
 * Bootstraps the full appliance parts database schema.
 *
 * Layer 1 — User-speed layer:      appliance_parts_cache (optimized output)
 * Layer 2 — Ground-truth ingest:   model_parts_raw
 * Layer 3 — Canonical resolution:  model_resolution, nameplate_extractions
 * Layer 4 — Reconciliation:        model_parts_master
 */
async function bootstrap() {
  console.log('Bootstrapping Full Parts Graph Schema...\n');

  try {
    // ── 1) nameplate_extractions ──────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS nameplate_extractions (
        id bigserial PRIMARY KEY,
        image_hash text NOT NULL,
        brand text,
        raw_model text,
        raw_serial text,
        product_type text,
        engineering_code text,
        confidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    console.log(' ✓ nameplate_extractions');

    // ── 2) model_resolution ──────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS model_resolution (
        id bigserial PRIMARY KEY,
        raw_model text NOT NULL UNIQUE,
        canonical_model text NOT NULL,
        alternate_models jsonb NOT NULL DEFAULT '[]'::jsonb,
        family_root text,
        brand text,
        ambiguity_score numeric,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_model_resolution_canonical ON model_resolution (canonical_model);`;
    console.log(' ✓ model_resolution');

    // ── 3) appliance_parts_cache (optimized output layer) ────────
    await sql`
      CREATE TABLE IF NOT EXISTS appliance_parts_cache (
        id bigserial PRIMARY KEY,
        normalized_model text NOT NULL UNIQUE,
        raw_model text,
        canonical_model text,
        summary text NOT NULL DEFAULT '',
        parts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        sources_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        completeness_score numeric,
        raw_row_count integer,
        master_row_count integer,
        section_count integer,
        truth_source text NOT NULL DEFAULT 'Manufacturer-first',
        source_strategy text NOT NULL DEFAULT 'manufacturer-first',
        fallback_sources text[] NOT NULL DEFAULT '{}',
        provider_plan_json jsonb,
        missing_section_flags jsonb DEFAULT '[]'::jsonb,
        conflict_flags jsonb DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz
      );
    `;
    await sql`ALTER TABLE appliance_parts_cache ADD COLUMN IF NOT EXISTS truth_source text NOT NULL DEFAULT 'Manufacturer-first';`;
    await sql`ALTER TABLE appliance_parts_cache ADD COLUMN IF NOT EXISTS source_strategy text NOT NULL DEFAULT 'manufacturer-first';`;
    await sql`ALTER TABLE appliance_parts_cache ADD COLUMN IF NOT EXISTS fallback_sources text[] NOT NULL DEFAULT '{}';`;
    await sql`ALTER TABLE appliance_parts_cache ADD COLUMN IF NOT EXISTS provider_plan_json jsonb;`;
    console.log(' ✓ appliance_parts_cache');

    // ── 4) model_parts_raw (ground-truth ingest) ─────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS model_parts_raw (
        id bigserial PRIMARY KEY,
        canonical_model text NOT NULL,
        source text NOT NULL,
        section_name text,
        diagram_ref text,
        provider_item_id text,
        raw_part_number text,
        raw_part_name text,
        raw_category text,
        quantity text,
        substitute_part_number text,
        serial_note text,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_model_parts_raw_model ON model_parts_raw (canonical_model)`;
    console.log(' ✓ model_parts_raw');

    // 3) Reconciled master parts table
    await sql`
      CREATE TABLE IF NOT EXISTS model_parts_master (
        id bigserial PRIMARY KEY,
        canonical_model text NOT NULL,
        canonical_part_number text NOT NULL,
        canonical_part_name text,
        normalized_section text,
        normalized_category text,
        preferred_source text,
        substitute_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
        serial_applicability jsonb NOT NULL DEFAULT '[]'::jsonb,
        provider_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        conflict_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (canonical_model, canonical_part_number)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_model_parts_master_model ON model_parts_master (canonical_model)`;
    console.log(' ✓ model_parts_master');

    // ── 4) bom_jobs (job management layer) ───────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS bom_jobs (
        id text PRIMARY KEY,

        job_stage text NOT NULL DEFAULT 'created',
        result_status text,

        brand text,
        model text,
        serial text,
        product_type text,

        coverage_score real NOT NULL DEFAULT 0,
        raw_row_count integer NOT NULL DEFAULT 0,
        unique_row_count integer NOT NULL DEFAULT 0,

        actual_unique_parts integer,
        coverage_pct real,
        expected_parts_total integer,
        expected_parts_source text,

        uploaded_files jsonb NOT NULL DEFAULT '[]'::jsonb,
        identity jsonb,
        diagram_parse jsonb,
        retrieved_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
        extracted_rows_raw jsonb NOT NULL DEFAULT '[]'::jsonb,
        final_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
        unmatched_callouts jsonb NOT NULL DEFAULT '[]'::jsonb,
        issues jsonb NOT NULL DEFAULT '[]'::jsonb,

        error_text text,

        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`ALTER TABLE bom_jobs ADD COLUMN IF NOT EXISTS actual_unique_parts integer;`;
    await sql`ALTER TABLE bom_jobs ADD COLUMN IF NOT EXISTS coverage_pct real;`;
    await sql`ALTER TABLE bom_jobs ADD COLUMN IF NOT EXISTS expected_parts_total integer;`;
    await sql`ALTER TABLE bom_jobs ADD COLUMN IF NOT EXISTS expected_parts_source text;`;
    await sql`CREATE INDEX IF NOT EXISTS bom_jobs_created_at_idx ON bom_jobs (created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_jobs_job_stage_idx ON bom_jobs (job_stage);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_jobs_result_status_idx ON bom_jobs (result_status);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_jobs_model_idx ON bom_jobs (model);`;

    console.log(' ✓ bom_jobs');
    await sql`
      CREATE TABLE IF NOT EXISTS bom_job_groups (
        id text PRIMARY KEY,
        job_id text NOT NULL,
        source text NOT NULL DEFAULT 'sears',
        source_url text NOT NULL,
        group_key text NOT NULL,
        group_name text NOT NULL,
        group_order integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'pending',
        source_text text,
        raw_row_count integer NOT NULL DEFAULT 0,
        accepted_row_count integer NOT NULL DEFAULT 0,
        error_text text,
        started_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`ALTER TABLE bom_job_groups ADD COLUMN IF NOT EXISTS source_text text;`;
    await sql`CREATE INDEX IF NOT EXISTS bom_job_groups_job_id_idx ON bom_job_groups (job_id, group_order);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_job_groups_status_idx ON bom_job_groups (status);`;

    console.log(' ✓ bom_job_groups');
    
    await sql`
      CREATE TABLE IF NOT EXISTS appliance_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        normalized_model text NOT NULL UNIQUE,
        raw_model text,
        brand text,
        brand_code text,
        product_type text,
        serial text,
        identity_confidence numeric,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS model_source_urls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
        source text NOT NULL DEFAULT 'encompass',
        url_type text NOT NULL,
        url text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        http_status integer,
        last_checked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (model_id, source, url_type, url)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS retrieval_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bom_job_id text,
        model_id uuid REFERENCES appliance_models(id) ON DELETE CASCADE,
        source_url_id uuid REFERENCES model_source_urls(id) ON DELETE SET NULL,
        model_number text NOT NULL,
        brand text,
        source text NOT NULL DEFAULT 'encompass',
        job_type text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        priority integer NOT NULL DEFAULT 100,
        attempt_count integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        locked_at timestamptz,
        locked_by text,
        started_at timestamptz,
        finished_at timestamptz,
        error text,
        result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS retrieval_jobs_status_idx ON retrieval_jobs (status, priority, created_at);`;
    await sql`CREATE INDEX IF NOT EXISTS retrieval_jobs_bom_job_idx ON retrieval_jobs (bom_job_id);`;
    await sql`CREATE INDEX IF NOT EXISTS retrieval_jobs_model_idx ON retrieval_jobs (model_id, source, job_type);`;
    await sql`
      CREATE TABLE IF NOT EXISTS capture_artifacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid REFERENCES appliance_models(id) ON DELETE CASCADE,
        job_id uuid REFERENCES retrieval_jobs(id) ON DELETE SET NULL,
        source text NOT NULL DEFAULT 'encompass',
        url text NOT NULL,
        artifact_type text NOT NULL,
        storage_path text,
        content_hash text,
        http_status integer,
        captured_at timestamptz NOT NULL DEFAULT now(),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bom_assemblies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
        source text NOT NULL DEFAULT 'encompass',
        assembly_name text NOT NULL,
        assembly_url text,
        diagram_url text,
        position integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (model_id, source, assembly_name)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bom_parts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
        assembly_id uuid REFERENCES bom_assemblies(id) ON DELETE SET NULL,
        source text NOT NULL DEFAULT 'encompass',
        part_number text NOT NULL,
        description text,
        diagram_ref text,
        quantity integer,
        source_url text,
        confidence numeric NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (model_id, source, part_number, assembly_id)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS part_pricing (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
        part_id uuid REFERENCES bom_parts(id) ON DELETE CASCADE,
        source text NOT NULL DEFAULT 'encompass',
        part_number text NOT NULL,
        price numeric,
        currency text NOT NULL DEFAULT 'USD',
        availability text,
        price_url text,
        captured_at timestamptz NOT NULL DEFAULT now(),
        evidence_artifact_id uuid REFERENCES capture_artifacts(id) ON DELETE SET NULL,
        UNIQUE (model_id, source, part_number),
        CONSTRAINT part_pricing_price_positive_or_null CHECK (price IS NULL OR price > 0)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS model_retrieval_summary (
        model_id uuid PRIMARY KEY REFERENCES appliance_models(id) ON DELETE CASCADE,
        retrieval_state text NOT NULL DEFAULT 'queued',
        expected_part_count integer,
        actual_part_count integer NOT NULL DEFAULT 0,
        priced_part_count integer NOT NULL DEFAULT 0,
        assembly_count integer NOT NULL DEFAULT 0,
        last_success_at timestamptz,
        last_failure_at timestamptz,
        error text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS encompass_brand_routes (
        brand text PRIMARY KEY,
        abv text NOT NULL,
        target_brand text NOT NULL,
        exploded_view_search_url text NOT NULL,
        is_alias_or_rollup boolean NOT NULL DEFAULT false,
        exploded_view_assembly_url_pattern text
      );
    `;
    await sql`
      INSERT INTO encompass_brand_routes (
        brand,
        abv,
        target_brand,
        exploded_view_search_url,
        is_alias_or_rollup,
        exploded_view_assembly_url_pattern
      ) VALUES
        (
          'Hisense',
          'hie',
          'Hisense',
          'https://encompass.com/Exploded-View-Search/hie/Hisense',
          false,
          'https://encompass.com/Exploded-View-Assembly/{abv}/{target_brand}/{model}'
        ),
        (
          'Gorenje',
          'hie',
          'Hisense',
          'https://encompass.com/Exploded-View-Search/hie/Hisense',
          true,
          'https://encompass.com/Exploded-View-Assembly/{abv}/{target_brand}/{model}'
        ),
        (
          'ASKO',
          'hie',
          'Hisense',
          'https://encompass.com/Exploded-View-Search/hie/Hisense',
          true,
          'https://encompass.com/Exploded-View-Assembly/{abv}/{target_brand}/{model}'
        )
      ON CONFLICT (brand) DO UPDATE SET
        abv = EXCLUDED.abv,
        target_brand = EXCLUDED.target_brand,
        exploded_view_search_url = EXCLUDED.exploded_view_search_url,
        is_alias_or_rollup = EXCLUDED.is_alias_or_rollup,
        exploded_view_assembly_url_pattern = EXCLUDED.exploded_view_assembly_url_pattern;
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS bom_telemetry (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id text,
        event text NOT NULL,
        status text NOT NULL,
        model text,
        brand text,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_job_id_idx ON bom_telemetry (job_id);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_event_idx ON bom_telemetry (event);`;
    await sql`CREATE INDEX IF NOT EXISTS bom_telemetry_created_at_idx ON bom_telemetry (created_at);`;
    console.log(' required retrieval architecture');

    await sql`
      CREATE TABLE IF NOT EXISTS model_parts_cache (
        id TEXT PRIMARY KEY,
        normalized_model TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        parts JSONB NOT NULL,
        is_exhaustive TEXT,
        msrp TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS normalized_model_idx ON model_parts_cache(normalized_model);`;
    // Ensure is_exhaustive exists on databases created before this column was added
    await sql`ALTER TABLE model_parts_cache ADD COLUMN IF NOT EXISTS is_exhaustive TEXT;`;
    console.log(' ✓ model_parts_cache');


    console.log('\n✅ Database bootstrap completed successfully.');
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();
