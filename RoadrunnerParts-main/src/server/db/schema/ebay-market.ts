import { pgTable, text, timestamp, bigserial, numeric, jsonb, integer, uuid } from "drizzle-orm/pg-core";
import { machineInventory } from "./machine-inventory";

export const partMarketSignals = pgTable("part_market_signal", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  partNumber: text("part_number").notNull(),
  normalizedModel: text("normalized_model"),

  ebayActiveCount: integer("ebay_active_count"),
  ebaySoldCount: integer("ebay_sold_count"),
  sellThroughRate: numeric("sell_through_rate", { precision: 10, scale: 4 }),

  medianSoldPrice: numeric("median_sold_price", { precision: 10, scale: 2 }),
  averageSoldPrice: numeric("average_sold_price", { precision: 10, scale: 2 }),
  activeMinPrice: numeric("active_min_price", { precision: 10, scale: 2 }),
  activeMaxPrice: numeric("active_max_price", { precision: 10, scale: 2 }),

  netExpected: numeric("net_expected", { precision: 10, scale: 2 }),
  confidence: text("confidence"),
  warnings: text("warnings").array(),

  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  raw: jsonb("raw").notNull().default({}),
});

export const channelListings = pgTable("channel_listing", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  partInventoryId: uuid("part_inventory_id"),
  channel: text("channel").notNull(),
  externalListingId: text("external_listing_id"),
  listingUrl: text("listing_url"),
  title: text("title"),
  listingPrice: numeric("listing_price", { precision: 10, scale: 2 }),
  listingStatus: text("listing_status"),
  listedAt: timestamp("listed_at", { withTimezone: true }),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }),
  netProfit: numeric("net_profit", { precision: 10, scale: 2 }),
  raw: jsonb("raw").notNull().default({}),
});

export const partInventory = pgTable("part_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  machineId: uuid("machine_id").references(() => machineInventory.id),
  normalizedModel: text("normalized_model"),
  partNumber: text("part_number").notNull(),
  partName: text("part_name"),
  condition: text("condition"),
  testedStatus: text("tested_status"),
  quantity: integer("quantity").default(1),
  storageBin: text("storage_bin"),
  photos: text("photos").array(),
  listedChannels: text("listed_channels").array(),
  soldChannel: text("sold_channel"),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }),
  netProfit: numeric("net_profit", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
