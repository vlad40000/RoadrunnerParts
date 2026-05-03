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

CREATE INDEX IF NOT EXISTS retrieval_jobs_status_idx
  ON retrieval_jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS retrieval_jobs_bom_job_idx
  ON retrieval_jobs (bom_job_id);
CREATE INDEX IF NOT EXISTS retrieval_jobs_model_idx
  ON retrieval_jobs (model_id, source, job_type);

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
