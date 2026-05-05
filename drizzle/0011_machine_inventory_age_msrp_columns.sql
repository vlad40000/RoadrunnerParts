CREATE TABLE IF NOT EXISTS machine_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code text,
  brand text,
  brand_family text,
  model text NOT NULL,
  normalized_model text,
  serial text,
  appliance_type text,
  condition text,
  location text,
  donor_status text,
  whole_machine_status text,
  tested_status text,
  acquired_cost numeric(10, 2),
  decoded_year integer,
  decoded_month_or_week text,
  decoded_age_months integer,
  decode_confidence text,
  original_msrp numeric(10, 2),
  msrp_confidence text,
  disposition_recommendation text,
  priority_score numeric(10, 2),
  reason_codes text[],
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE machine_inventory
ADD COLUMN IF NOT EXISTS resolved_oem_brand text,
ADD COLUMN IF NOT EXISTS manufacturer_family text,
ADD COLUMN IF NOT EXISTS decoded_month integer,
ADD COLUMN IF NOT EXISTS decoded_week integer,
ADD COLUMN IF NOT EXISTS decoded_manufacture_date date,
ADD COLUMN IF NOT EXISTS decode_reason text,
ADD COLUMN IF NOT EXISTS decode_rules_applied jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS decode_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS age_band text,
ADD COLUMN IF NOT EXISTS age_band_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_review_reason text,
ADD COLUMN IF NOT EXISTS age_band_checked_at timestamptz;

ALTER TABLE machine_inventory
ADD COLUMN IF NOT EXISTS original_msrp_cents integer,
ADD COLUMN IF NOT EXISTS original_msrp_currency text,
ADD COLUMN IF NOT EXISTS original_msrp_confidence text,
ADD COLUMN IF NOT EXISTS original_msrp_source_url text,
ADD COLUMN IF NOT EXISTS original_msrp_archive_url text,
ADD COLUMN IF NOT EXISTS original_msrp_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS machine_inventory_age_band_idx
  ON machine_inventory (age_band, age_band_checked_at DESC);

CREATE INDEX IF NOT EXISTS machine_inventory_model_serial_idx
  ON machine_inventory (model, serial);
