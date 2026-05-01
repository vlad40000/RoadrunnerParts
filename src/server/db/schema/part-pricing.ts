import { pgTable, text, timestamp, numeric, bigserial, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const partPriceSnapshots = pgTable("part_price_snapshot", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  partNumber: text("part_number").notNull(),
  normalizedModel: text("normalized_model"),

  primarySource: text("primary_source"),
  listedPrice: numeric("listed_price", { precision: 10, scale: 2 }),
  currency: text("currency").default("USD"),
  availability: text("availability"),

  productUrl: text("product_url"),
  productTitle: text("product_title"),
  matchType: text("match_type"),
  priceStatus: text("price_status").notNull(),

  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  sourceObservedAt: timestamp("source_observed_at", { withTimezone: true }),
  raw: jsonb("raw").notNull().default({}),
}, (table) => {
  return {
    priceStatusCheck: check(
      "part_price_status_check",
      sql`price_status in (
        'verified_price',
        'fallback_verified_price',
        'no_verified_price',
        'exact_part_found_no_price',
        'part_not_found',
        'ambiguous_match',
        'blocked',
        'source_error'
      )`
    ),
    noPriceCheck: check(
      "no_price_without_verified_status",
      sql`(
        price_status in ('verified_price', 'fallback_verified_price')
        and listed_price is not null
      )
      or
      (
        price_status not in ('verified_price', 'fallback_verified_price')
        and listed_price is null
      )`
    ),
  };
});
