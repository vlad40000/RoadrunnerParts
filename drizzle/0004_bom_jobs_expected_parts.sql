ALTER TABLE bom_jobs
ADD COLUMN expected_parts_total integer,
ADD COLUMN expected_parts_source text,
ADD COLUMN expected_parts_confidence real,
ADD COLUMN actual_unique_parts integer,
ADD COLUMN coverage_pct real;
