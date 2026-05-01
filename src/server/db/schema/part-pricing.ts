import { pgTable, text, timestamp, numeric, bigserial, bigint, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  matchType: text("match_type").notNull(),
  priceStatus: text("price_status").notNull(),

  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  sourceObservedAt: timestamp("source_observed_at", { withTimezone: true }),
  raw: jsonb("raw").notNull().default({}),
});

export const partPriceFallbacks = pgTable("part_price_fallback", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  snapshotId: bigint("snapshot_id", { mode: "bigint" }).references(() => partPriceSnapshots.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: text("currency").default("USD"),
  availability: text("availability"),
  productUrl: text("product_url"),
  confidence: text("confidence"),
  raw: jsonb("raw").notNull().default({}),
});

export const partPriceSnapshotsRelations = relations(partPriceSnapshots, ({ many }) => ({
  fallbacks: many(partPriceFallbacks),
}));

export const partPriceFallbacksRelations = relations(partPriceFallbacks, ({ one }) => ({
  snapshot: one(partPriceSnapshots, {
    fields: [partPriceFallbacks.snapshotId],
    references: [partPriceSnapshots.id],
  }),
}));
