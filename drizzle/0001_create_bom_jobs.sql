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

CREATE INDEX IF NOT EXISTS bom_jobs_created_at_idx
  ON bom_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS bom_jobs_job_stage_idx
  ON bom_jobs (job_stage);

CREATE INDEX IF NOT EXISTS bom_jobs_result_status_idx
  ON bom_jobs (result_status);

CREATE INDEX IF NOT EXISTS bom_jobs_model_idx
  ON bom_jobs (model);
