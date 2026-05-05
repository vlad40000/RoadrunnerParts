CREATE TABLE IF NOT EXISTS part_market_signal (
  id bigserial PRIMARY KEY,
  part_number text NOT NULL,
  normalized_model text,
  ebay_active_count integer,
  ebay_sold_count integer,
  sell_through_rate numeric(10, 4),
  median_sold_price numeric(10, 2),
  average_sold_price numeric(10, 2),
  active_min_price numeric(10, 2),
  active_max_price numeric(10, 2),
  net_expected numeric(10, 2),
  confidence text,
  warnings text[],
  checked_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS part_market_signal_part_model_uidx
  ON part_market_signal (part_number, normalized_model);

CREATE INDEX IF NOT EXISTS part_market_signal_net_expected_idx
  ON part_market_signal (net_expected DESC NULLS LAST, checked_at DESC);

CREATE TABLE IF NOT EXISTS part_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES machine_inventory(id),
  normalized_model text,
  part_number text NOT NULL,
  part_name text,
  condition text,
  tested_status text,
  quantity integer DEFAULT 1,
  storage_bin text,
  photos text[],
  listed_channels text[],
  sold_channel text,
  sold_price numeric(10, 2),
  shipping_cost numeric(10, 2),
  net_profit numeric(10, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS part_inventory_machine_part_uidx
  ON part_inventory (machine_id, part_number)
  WHERE machine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS part_inventory_part_number_idx
  ON part_inventory (part_number);

CREATE TABLE IF NOT EXISTS channel_listing (
  id bigserial PRIMARY KEY,
  part_inventory_id uuid REFERENCES part_inventory(id),
  channel text NOT NULL,
  external_listing_id text,
  listing_url text,
  title text,
  listing_price numeric(10, 2),
  listing_status text,
  listed_at timestamptz,
  sold_at timestamptz,
  sold_price numeric(10, 2),
  shipping_cost numeric(10, 2),
  net_profit numeric(10, 2),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_listing_open_part_channel_uidx
  ON channel_listing (part_inventory_id, channel)
  WHERE listing_status IN ('draft', 'active') AND part_inventory_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS channel_listing_status_idx
  ON channel_listing (channel, listing_status);
