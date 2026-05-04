CREATE TABLE IF NOT EXISTS model_diagram_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_model text NOT NULL,
  source text NOT NULL,
  source_url text NOT NULL,
  trusted_total_part_count integer,
  manifest_row_count integer NOT NULL DEFAULT 0,
  required_manifest_row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'discovered',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagram_section (
  id bigserial PRIMARY KEY,
  manifest_id uuid NOT NULL REFERENCES model_diagram_manifest(id),
  section_name text NOT NULL,
  section_original text,
  section_url text,
  section_key text,
  section_order integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_manifest_section UNIQUE (manifest_id, section_name, section_url)
);

CREATE TABLE IF NOT EXISTS diagram_manifest_row (
  id bigserial PRIMARY KEY,
  manifest_id uuid NOT NULL REFERENCES model_diagram_manifest(id),
  section_id bigint REFERENCES diagram_section(id),
  normalized_model text NOT NULL,
  diagram_key text NOT NULL,
  callout text,
  expected_part_number text,
  expected_part_name text,
  quantity integer DEFAULT 1,
  row_type text NOT NULL DEFAULT 'required',
  is_required boolean NOT NULL DEFAULT true,
  source_url text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_manifest_row UNIQUE (manifest_id, diagram_key, expected_part_number, callout)
);

CREATE TABLE IF NOT EXISTS bom_part_mapping (
  id bigserial PRIMARY KEY,
  normalized_model text NOT NULL,
  manifest_row_id bigint NOT NULL REFERENCES diagram_manifest_row(id),
  bom_part_id bigint REFERENCES bom_part(id),
  expected_part_number text,
  found_part_number text,
  mapping_status text NOT NULL,
  mapping_confidence real,
  evidence_source text,
  evidence_url text,
  checked_at timestamptz DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT unique_manifest_bom_mapping UNIQUE (manifest_row_id, bom_part_id, mapping_status)
);

ALTER TABLE appliance_models
ADD COLUMN trusted_total_part_count integer,
ADD COLUMN trusted_total_count_source text,
ADD COLUMN trusted_total_count_source_url text,
ADD COLUMN trusted_total_count_checked_at timestamptz,
ADD COLUMN manifest_row_count integer DEFAULT 0,
ADD COLUMN required_manifest_row_count integer DEFAULT 0,
ADD COLUMN mapped_required_manifest_row_count integer DEFAULT 0,
ADD COLUMN unresolved_required_manifest_row_count integer DEFAULT 0,
ADD COLUMN actual_canonical_part_count integer DEFAULT 0;

ALTER TABLE appliance_models
DROP CONSTRAINT IF EXISTS bom_complete_requires_parts_and_prices;

ALTER TABLE appliance_models
ADD CONSTRAINT bom_complete_requires_manifest_parts_and_prices
CHECK (
  bom_complete = false OR (
    parts_complete = true
    AND pricing_complete = true
    AND trusted_total_part_count IS NOT NULL
    AND manifest_row_count >= trusted_total_part_count
    AND required_manifest_row_count > 0
    AND unresolved_required_manifest_row_count = 0
    AND mapped_required_manifest_row_count >= required_manifest_row_count
    AND actual_canonical_part_count >= trusted_total_part_count
    AND verified_price_count >= required_price_count
  )
);
