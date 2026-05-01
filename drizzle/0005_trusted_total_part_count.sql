ALTER TABLE bom_jobs
ADD COLUMN trusted_total_part_count integer,
ADD COLUMN trusted_total_count_source text,
ADD COLUMN trusted_total_count_source_url text,
ADD COLUMN trusted_total_count_checked_at timestamptz,
ADD COLUMN actual_canonical_part_count integer;

ALTER TABLE model_parts_cache
ADD COLUMN trusted_total_part_count integer,
ADD COLUMN trusted_total_count_source text,
ADD COLUMN trusted_total_count_source_url text,
ADD COLUMN trusted_total_count_checked_at timestamptz,
ADD COLUMN actual_canonical_part_count integer,
ADD COLUMN parts_complete boolean DEFAULT false;
