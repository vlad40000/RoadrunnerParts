CREATE TABLE IF NOT EXISTS appliance_inventory_queue (
  machine_id text PRIMARY KEY,
  rank_score integer NOT NULL DEFAULT 0,
  queue_band text NOT NULL DEFAULT 'manual_review',
  recommended_action text NOT NULL DEFAULT 'manual_review',
  age_band text NOT NULL DEFAULT 'unknown',
  condition text,
  brand text,
  model text,
  serial text,
  decoded_age_months integer,
  msrp_lookup_eligible boolean NOT NULL DEFAULT false,
  ebay_survey_status text NOT NULL DEFAULT 'pending',
  production_decision_status text NOT NULL DEFAULT 'pending',
  decision_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appliance_inventory_queue_rank_idx
  ON appliance_inventory_queue (rank_score DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS appliance_inventory_queue_ebay_status_idx
  ON appliance_inventory_queue (ebay_survey_status, rank_score DESC);

CREATE INDEX IF NOT EXISTS appliance_inventory_queue_age_band_idx
  ON appliance_inventory_queue (age_band, rank_score DESC);
