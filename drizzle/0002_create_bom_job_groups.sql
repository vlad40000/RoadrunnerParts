CREATE TABLE IF NOT EXISTS bom_job_groups (
  id text PRIMARY KEY,
  job_id text NOT NULL,
  source text NOT NULL DEFAULT 'sears',
  source_url text NOT NULL,
  group_key text NOT NULL,
  group_name text NOT NULL,
  group_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  raw_row_count integer NOT NULL DEFAULT 0,
  accepted_row_count integer NOT NULL DEFAULT 0,
  error_text text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bom_job_groups_job_id_idx
  ON bom_job_groups (job_id, group_order);

CREATE INDEX IF NOT EXISTS bom_job_groups_status_idx
  ON bom_job_groups (status);
