ALTER TABLE IF EXISTS appliance_unit
ADD COLUMN IF NOT EXISTS resolved_oem_brand text,
ADD COLUMN IF NOT EXISTS manufacturer_family text,
ADD COLUMN IF NOT EXISTS decoded_year integer,
ADD COLUMN IF NOT EXISTS decoded_month integer,
ADD COLUMN IF NOT EXISTS decoded_week integer,
ADD COLUMN IF NOT EXISTS decoded_manufacture_date date,
ADD COLUMN IF NOT EXISTS decoded_age_months integer,
ADD COLUMN IF NOT EXISTS decode_confidence text,
ADD COLUMN IF NOT EXISTS decode_reason text,
ADD COLUMN IF NOT EXISTS decode_rules_applied jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS decode_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS age_band text,
ADD COLUMN IF NOT EXISTS age_band_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_review_reason text,
ADD COLUMN IF NOT EXISTS age_band_checked_at timestamptz;

ALTER TABLE IF EXISTS appliance_unit
ADD COLUMN IF NOT EXISTS original_msrp_cents integer,
ADD COLUMN IF NOT EXISTS original_msrp_currency text,
ADD COLUMN IF NOT EXISTS original_msrp_confidence text,
ADD COLUMN IF NOT EXISTS original_msrp_source_url text,
ADD COLUMN IF NOT EXISTS original_msrp_archive_url text,
ADD COLUMN IF NOT EXISTS original_msrp_checked_at timestamptz;
