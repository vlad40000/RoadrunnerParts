import { pgTable, text, timestamp, bigserial, integer, jsonb, unique } from "drizzle-orm/pg-core";

export const bomParts = pgTable("bom_part", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  normalizedModel: text("normalized_model").notNull(),
  partNumber: text("part_number").notNull(),
  partName: text("part_name"),
  diagramSection: text("diagram_section"),
  callout: text("callout"),
  quantity: integer("quantity"),
  source: text("source"),
  sourceUrl: text("source_url"),
  substitutePartNumber: text("substitute_part_number"),
  confidence: text("confidence"),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => {
  return {
    uniqueModelPart: unique("unique_model_part").on(table.normalizedModel, table.partNumber),
  };
});
