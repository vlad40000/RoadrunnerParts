CREATE TABLE IF NOT EXISTS ebay_listing_image_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text NOT NULL,
  image_url text NOT NULL,
  thumbnail_url text,
  page_url text,
  title text,
  source_domain text,
  source text,
  review_status text,
  score numeric(10, 2),
  blob_pathname text,
  remote_image_url text,
  local_image_path text,
  mime_type text,
  byte_length integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ebay_listing_image_asset_part_image_uidx
  ON ebay_listing_image_asset (part_number, image_url);

CREATE INDEX IF NOT EXISTS ebay_listing_image_asset_part_idx
  ON ebay_listing_image_asset (part_number, last_seen_at DESC);
