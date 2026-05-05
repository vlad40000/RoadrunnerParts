CREATE TABLE IF NOT EXISTS bom_part (
  id bigserial PRIMARY KEY,
  normalized_model text NOT NULL,
  part_number text NOT NULL,
  part_name text,
  diagram_section text,
  callout text,
  quantity integer,
  source text,
  source_url text,
  substitute_part_number text,
  confidence text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_model_part
  ON bom_part (normalized_model, part_number);

CREATE INDEX IF NOT EXISTS bom_part_part_number_idx
  ON bom_part (part_number);
