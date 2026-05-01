import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const applianceModels = pgTable("appliance_model", {
  id: text("id").primaryKey(), // Usually brand:model
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  
  expectedPartCount: integer("expected_part_count"),
  actualPartCount: integer("actual_part_count"),
  requiredPriceCount: integer("required_price_count"),
  verifiedPriceCount: integer("verified_price_count"),
  
  retrievalState: text("retrieval_state").notNull().default("no_result"),
  
  bomComplete: boolean("bom_complete").notNull().default(false),
  partsComplete: boolean("parts_complete").notNull().default(false),
  pricingComplete: boolean("pricing_complete").notNull().default(false),
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
