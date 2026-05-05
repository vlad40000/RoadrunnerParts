import { pgTable, text, timestamp, uuid, numeric, integer, jsonb, boolean, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const machineInventory = pgTable("machine_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  machineCode: text("machine_code"),
  brand: text("brand"),
  brandFamily: text("brand_family"),
  model: text("model").notNull(),
  normalizedModel: text("normalized_model"),
  serial: text("serial"),
  applianceType: text("appliance_type"),
  condition: text("condition"),
  location: text("location"),
  donorStatus: text("donor_status"),
  wholeMachineStatus: text("whole_machine_status"),
  testedStatus: text("tested_status"),
  acquiredCost: numeric("acquired_cost", { precision: 10, scale: 2 }),
  
  // Decoding fields
  decodedYear: integer("decoded_year"),
  decodedMonth: integer("decoded_month"),
  decodedWeek: integer("decoded_week"),
  decodedMonthOrWeek: text("decoded_month_or_week"),
  decodedManufactureDate: date("decoded_manufacture_date"),
  decodedAgeMonths: integer("decoded_age_months"),
  decodeConfidence: text("decode_confidence"),
  decodeReason: text("decode_reason"),
  decodeRulesApplied: jsonb("decode_rules_applied").notNull().default([]),
  decodeCandidates: jsonb("decode_candidates").notNull().default([]),
  
  // Age banding
  ageBand: text("age_band"),
  ageBandStatus: text("age_band_status").notNull().default("pending"),
  ageBandCheckedAt: timestamp("age_band_checked_at", { withTimezone: true }),
  
  // Manual Review
  manualReviewRequired: boolean("manual_review_required").notNull().default(false),
  manualReviewReason: text("manual_review_reason"),
  
  // MSRP
  originalMsrp: numeric("original_msrp", { precision: 10, scale: 2 }),
  msrpConfidence: text("msrp_confidence"),
  originalMsrpCents: integer("original_msrp_cents"),
  originalMsrpCurrency: text("original_msrp_currency"),
  originalMsrpConfidence: text("original_msrp_confidence"),
  originalMsrpSourceUrl: text("original_msrp_source_url"),
  originalMsrpArchiveUrl: text("original_msrp_archive_url"),
  originalMsrpCheckedAt: timestamp("original_msrp_checked_at", { withTimezone: true }),
  
  // Logistics/Priority
  dispositionRecommendation: text("disposition_recommendation"),
  priorityScore: numeric("priority_score", { precision: 10, scale: 2 }),
  reasonCodes: text("reason_codes").array(),
  
  // Meta
  resolvedOemBrand: text("resolved_oem_brand"),
  manufacturerFamily: text("manufacturer_family"),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
