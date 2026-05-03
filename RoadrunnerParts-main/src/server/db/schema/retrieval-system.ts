import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  numeric,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * 4.1 Models
 */
export const applianceModels = pgTable("appliance_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedModel: text("normalized_model").notNull().unique(),
  rawModel: text("raw_model"),
  brand: text("brand"),
  brandCode: text("brand_code"),
  productType: text("product_type"),
  serial: text("serial"),
  identityConfidence: numeric("identity_confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 4.2 Source URLs
 */
export const modelSourceUrls = pgTable("model_source_urls", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => applianceModels.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("encompass"),
  urlType: text("url_type").notNull(), // model_page, exploded_view, assembly_page, pricing_page
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  httpStatus: integer("http_status"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.modelId, t.source, t.urlType, t.url),
}));

/**
 * 4.3 Retrieval Jobs
 */
export const retrievalJobs = pgTable("retrieval_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  bomJobId: text("bom_job_id"),
  modelId: uuid("model_id").references(() => applianceModels.id, { onDelete: "cascade" }),
  sourceUrlId: uuid("source_url_id").references(() => modelSourceUrls.id, { onDelete: "set null" }),
  modelNumber: text("model_number").notNull(),
  brand: text("brand"),
  source: text("source").notNull().default("encompass"),
  jobType: text("job_type").notNull(), // resolve_model_identity, build_encompass_urls, etc.
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(100),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  resultSummary: jsonb("result_summary").notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 4.4 Capture Artifacts
 */
export const captureArtifacts = pgTable("capture_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").references(() => applianceModels.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => retrievalJobs.id, { onDelete: "set null" }),
  source: text("source").notNull().default("encompass"),
  url: text("url").notNull(),
  artifactType: text("artifact_type").notNull(), // static_html, rendered_html, screenshot, etc.
  storagePath: text("storage_path"),
  contentHash: text("content_hash"),
  httpStatus: integer("http_status"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
});

/**
 * 4.5 Assemblies
 */
export const bomAssemblies = pgTable("bom_assemblies", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => applianceModels.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("encompass"),
  assemblyName: text("assembly_name").notNull(),
  assemblyUrl: text("assembly_url"),
  diagramUrl: text("diagram_url"),
  position: integer("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.modelId, t.source, t.assemblyName),
}));

/**
 * 4.6 Parts
 */
export const bomParts = pgTable("bom_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => applianceModels.id, { onDelete: "cascade" }),
  assemblyId: uuid("assembly_id").references(() => bomAssemblies.id, { onDelete: "set null" }),
  source: text("source").notNull().default("encompass"),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  diagramRef: text("diagram_ref"),
  quantity: integer("quantity"),
  sourceUrl: text("source_url"),
  confidence: numeric("confidence").notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.modelId, t.source, t.partNumber, t.assemblyId),
}));

/**
 * 4.7 Pricing
 */
export const partPricing = pgTable("part_pricing", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => applianceModels.id, { onDelete: "cascade" }),
  partId: uuid("part_id").references(() => bomParts.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("encompass"),
  partNumber: text("part_number").notNull(),
  price: numeric("price"),
  currency: text("currency").notNull().default("USD"),
  availability: text("availability"),
  priceUrl: text("price_url"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  evidenceArtifactId: uuid("evidence_artifact_id").references(() => captureArtifacts.id, { onDelete: "set null" }),
}, (t) => ({
  unq: unique().on(t.modelId, t.source, t.partNumber),
}));

/**
 * 4.8 Retrieval Summary
 */
export const modelRetrievalSummary = pgTable("model_retrieval_summary", {
  modelId: uuid("model_id").primaryKey().references(() => applianceModels.id, { onDelete: "cascade" }),
  retrievalState: text("retrieval_state").notNull().default("queued"),
  expectedPartCount: integer("expected_part_count"),
  actualPartCount: integer("actual_part_count").notNull().default(0),
  pricedPartCount: integer("priced_part_count").notNull().default(0),
  assemblyCount: integer("assembly_count").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  error: text("error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 4.9 Batch Imports
 */
export const batchImports = pgTable("batch_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename"),
  status: text("status").notNull().default("not_started"), // queued, running, bom_complete, etc.
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 4.10 Physical Appliances (Inventory)
 */
export const physicalAppliances = pgTable("physical_appliances", {
  id: uuid("id").primaryKey().defaultRandom(),
  machineId: text("machine_id").unique(),
  modelId: uuid("model_id").references(() => applianceModels.id, { onDelete: "set null" }),
  batchId: uuid("batch_id").references(() => batchImports.id, { onDelete: "cascade" }),
  serialNumber: text("serial_number"),
  brand: text("brand"),
  productType: text("product_type"),
  location: text("location"),
  condition: text("condition"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
