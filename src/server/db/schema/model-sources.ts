import { pgTable, text, timestamp, bigserial, integer, jsonb } from "drizzle-orm/pg-core";

export const modelSources = pgTable("model_source", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  normalizedModel: text("normalized_model").notNull(),
  source: text("source").notNull(),
  tier: text("tier"),
  sourceUrl: text("source_url").notNull(),
  urlType: text("url_type"),
  confidence: text("confidence"),
  sectionCount: integer("section_count"),
  expectedPartCount: integer("expected_part_count"),
  status: text("status"),
  raw: jsonb("raw").notNull().default({}),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
});
