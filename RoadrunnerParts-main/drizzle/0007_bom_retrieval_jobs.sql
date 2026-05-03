CREATE TABLE IF NOT EXISTS bom_retrieval_jobs (
  id text PRIMARY KEY,
  bom_job_id text NOT NULL,
  provider text NOT NULL DEFAULT 'encompass',
  job_type text NOT NULL DEFAULT 'encompass_bom_pricing',
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  model text NOT NULL,
  brand text,
  source_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bom_retrieval_jobs_status_idx
  ON bom_retrieval_jobs (status, priority, created_at);

CREATE INDEX IF NOT EXISTS bom_retrieval_jobs_bom_job_idx
  ON bom_retrieval_jobs (bom_job_id);

CREATE INDEX IF NOT EXISTS bom_retrieval_jobs_provider_model_idx
  ON bom_retrieval_jobs (provider, model);

CREATE UNIQUE INDEX IF NOT EXISTS bom_retrieval_jobs_dedup_idx
  ON bom_retrieval_jobs (bom_job_id, provider, job_type, model);
