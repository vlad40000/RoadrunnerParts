import { pgTable, text, timestamp, integer, boolean, uuid, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const applianceModels = pgTable("appliance_model", {
  id: uuid("id").primaryKey().defaultRandom(),
  brand: text("brand"),
  brandFamily: text("brand_family"),
  normalizedModel: text("normalized_model").unique().notNull(),
  applianceType: text("appliance_type"),

  expectedPartCount: integer("expected_part_count"),
  trustedTotalPartCount: integer("trusted_total_part_count"),
  trustedTotalCountSource: text("trusted_total_count_source"),
  trustedTotalCountSourceUrl: text("trusted_total_count_source_url"),
  trustedTotalCountCheckedAt: timestamp("trusted_total_count_checked_at", { withTimezone: true }),
  manifestRowCount: integer("manifest_row_count").default(0),
  requiredManifestRowCount: integer("required_manifest_row_count").default(0),
  mappedRequiredManifestRowCount: integer("mapped_required_manifest_row_count").default(0),
  unresolvedRequiredManifestRowCount: integer("unresolved_required_manifest_row_count").default(0),
  actualPartCount: integer("actual_part_count").default(0),
  actualCanonicalPartCount: integer("actual_canonical_part_count").default(0),
  requiredPriceCount: integer("required_price_count").default(0),
  verifiedPriceCount: integer("verified_price_count").default(0),

  retrievalState: text("retrieval_state").notNull().default("no_result"),
  bomComplete: boolean("bom_complete").notNull().default(false),
  partsComplete: boolean("parts_complete").notNull().default(false),
  pricingComplete: boolean("pricing_complete").notNull().default(false),

  diagramParse: jsonb("diagram_parse"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => {
  return {
    bomCompleteCheck: check(
      "bom_complete_requires_parts_and_prices",
      sql`bom_complete = false or (
        parts_complete = true 
        and pricing_complete = true 
        and trusted_total_part_count is not null
        and manifest_row_count >= trusted_total_part_count
        and required_manifest_row_count > 0
        and unresolved_required_manifest_row_count = 0
        and mapped_required_manifest_row_count >= required_manifest_row_count
        and actual_canonical_part_count >= trusted_total_part_count
        and verified_price_count >= required_price_count
      )`
    ),
  };
});

export const nameplateExtractions = pgTable("nameplate_extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelNumber: text("model_number"),
  serialNumber: text("serial_number"),
  brand: text("brand"),
  productType: text("product_type"),
  engineeringCode: text("engineering_code"),
  rawResult: jsonb("raw_result").notNull(),
  sourceType: text("source_type").notNull(), // 'image' or 'pdf'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
