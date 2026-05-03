import {
  bigserial,
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { bomParts } from "./bom-parts";

export const modelDiagramManifest = pgTable("model_diagram_manifest", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedModel: text("normalized_model").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url").notNull(),
  trustedTotalPartCount: integer("trusted_total_part_count"),
  manifestRowCount: integer("manifest_row_count").notNull().default(0),
  requiredManifestRowCount: integer("required_manifest_row_count").notNull().default(0),
  status: text("status").notNull().default("discovered"),
  raw: jsonb("raw").notNull().default({}),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const diagramSections = pgTable("diagram_section", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  manifestId: uuid("manifest_id")
    .notNull()
    .references(() => modelDiagramManifest.id),
  sectionName: text("section_name").notNull(),
  sectionOriginal: text("section_original"),
  sectionUrl: text("section_url"),
  sectionKey: text("section_key"),
  sectionOrder: integer("section_order"),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueManifestSection: unique("unique_manifest_section").on(
    table.manifestId,
    table.sectionName,
    table.sectionUrl,
  ),
}));

export const diagramManifestRows = pgTable("diagram_manifest_row", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  manifestId: uuid("manifest_id")
    .notNull()
    .references(() => modelDiagramManifest.id),
  sectionId: bigint("section_id", { mode: "bigint" })
    .references(() => diagramSections.id),
  normalizedModel: text("normalized_model").notNull(),
  diagramKey: text("diagram_key").notNull(),
  callout: text("callout"),
  expectedPartNumber: text("expected_part_number"),
  expectedPartName: text("expected_part_name"),
  quantity: integer("quantity").default(1),
  rowType: text("row_type").notNull().default("required"),
  isRequired: boolean("is_required").notNull().default(true),
  sourceUrl: text("source_url").notNull(),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueManifestRow: unique("unique_manifest_row").on(
    table.manifestId,
    table.diagramKey,
    table.expectedPartNumber,
    table.callout,
  ),
}));

export const bomPartMappings = pgTable("bom_part_mapping", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  normalizedModel: text("normalized_model").notNull(),
  manifestRowId: bigint("manifest_row_id", { mode: "bigint" })
    .notNull()
    .references(() => diagramManifestRows.id),
  bomPartId: bigint("bom_part_id", { mode: "bigint" })
    .references(() => bomParts.id),
  expectedPartNumber: text("expected_part_number"),
  foundPartNumber: text("found_part_number"),
  mappingStatus: text("mapping_status").notNull(),
  mappingConfidence: real("mapping_confidence"),
  evidenceSource: text("evidence_source"),
  evidenceUrl: text("evidence_url"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
  raw: jsonb("raw").notNull().default({}),
}, (table) => ({
  uniqueManifestBomMapping: unique("unique_manifest_bom_mapping").on(
    table.manifestRowId,
    table.bomPartId,
    table.mappingStatus,
  ),
}));
