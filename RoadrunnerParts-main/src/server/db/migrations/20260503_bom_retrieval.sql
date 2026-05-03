-- Task 1: Create DB migrations for BOM Retrieval System

-- 4.1 Models
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

-- 4.2 Source URLs
CREATE TABLE IF NOT EXISTS model_source_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'encompass',
  url_type text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  http_status int,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_id, source, url_type, url)
);

-- 4.3 Retrieval Jobs
CREATE TABLE IF NOT EXISTS retrieval_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES appliance_models(id) ON DELETE CASCADE,
  model_number text NOT NULL,
  brand text,
  source text NOT NULL DEFAULT 'encompass',
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority int NOT NULL DEFAULT 100,
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.4 Capture Artifacts
CREATE TABLE IF NOT EXISTS capture_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES appliance_models(id) ON DELETE CASCADE,
  job_id uuid REFERENCES retrieval_jobs(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'encompass',
  url text NOT NULL,
  artifact_type text NOT NULL,
  storage_path text,
  content_hash text,
  http_status int,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 4.5 Assemblies
CREATE TABLE IF NOT EXISTS bom_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'encompass',
  assembly_name text NOT NULL,
  assembly_url text,
  diagram_url text,
  position int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_id, source, assembly_name)
);

-- 4.6 Parts
CREATE TABLE IF NOT EXISTS bom_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES appliance_models(id) ON DELETE CASCADE,
  assembly_id uuid REFERENCES bom_assemblies(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'encompass',
  part_number text NOT NULL,
  description text,
  diagram_ref text,
  quantity int,
  source_url text,
  confidence numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_id, source, part_number, assembly_id)
);

-- 4.7 Pricing
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
  UNIQUE(model_id, source, part_number)
);

-- 4.8 Retrieval Summary
CREATE TABLE IF NOT EXISTS model_retrieval_summary (
  model_id uuid PRIMARY KEY REFERENCES appliance_models(id) ON DELETE CASCADE,
  retrieval_state text NOT NULL DEFAULT 'queued',
  expected_part_count int,
  actual_part_count int NOT NULL DEFAULT 0,
  priced_part_count int NOT NULL DEFAULT 0,
  assembly_count int NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.9 Batch Imports
CREATE TABLE IF NOT EXISTS batch_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text,
  status text NOT NULL DEFAULT 'not_started',
  total_rows int NOT NULL DEFAULT 0,
  processed_rows int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.10 Physical Appliances (Inventory)
CREATE TABLE IF NOT EXISTS physical_appliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id text UNIQUE,
  model_id uuid REFERENCES appliance_models(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES batch_imports(id) ON DELETE CASCADE,
  serial_number text,
  brand text,
  product_type text,
  location text,
  condition text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
