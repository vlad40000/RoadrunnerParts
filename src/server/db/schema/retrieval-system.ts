import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const retrievalApplianceModels = pgTable("appliance_models", {
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

export const modelSourceUrls = pgTable(
  "model_source_urls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => retrievalApplianceModels.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("encompass"),
    urlType: text("url_type").notNull(),
    url: text("url").notNull(),
    status: text("status").notNull().default("pending"),
    httpStatus: integer("http_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueModelSourceUrl: unique("model_source_urls_unq").on(
      table.modelId,
      table.source,
      table.urlType,
      table.url,
    ),
  }),
);

export const retrievalJobs = pgTable("retrieval_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  bomJobId: text("bom_job_id"),
  modelId: uuid("model_id").references(() => retrievalApplianceModels.id, {
    onDelete: "cascade",
  }),
  sourceUrlId: uuid("source_url_id").references(() => modelSourceUrls.id, {
    onDelete: "set null",
  }),
  modelNumber: text("model_number").notNull(),
  brand: text("brand"),
  source: text("source").notNull().default("encompass"),
  jobType: text("job_type").notNull(),
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

export const captureArtifacts = pgTable("capture_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").references(() => retrievalApplianceModels.id, {
    onDelete: "cascade",
  }),
  jobId: uuid("job_id").references(() => retrievalJobs.id, { onDelete: "set null" }),
  source: text("source").notNull().default("encompass"),
  url: text("url").notNull(),
  artifactType: text("artifact_type").notNull(),
  storagePath: text("storage_path"),
  contentHash: text("content_hash"),
  httpStatus: integer("http_status"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
});

export const bomAssemblies = pgTable(
  "bom_assemblies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => retrievalApplianceModels.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("encompass"),
    assemblyName: text("assembly_name").notNull(),
    assemblyUrl: text("assembly_url"),
    diagramUrl: text("diagram_url"),
    position: integer("position"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueAssembly: unique("bom_assemblies_unq").on(
      table.modelId,
      table.source,
      table.assemblyName,
    ),
  }),
);

export const retrievalBomParts = pgTable(
  "bom_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => retrievalApplianceModels.id, { onDelete: "cascade" }),
    assemblyId: uuid("assembly_id").references(() => bomAssemblies.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("encompass"),
    partNumber: text("part_number").notNull(),
    description: text("description"),
    diagramRef: text("diagram_ref"),
    quantity: integer("quantity"),
    sourceUrl: text("source_url"),
    confidence: numeric("confidence").notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePart: unique("retrieval_bom_parts_unq").on(
      table.modelId,
      table.source,
      table.partNumber,
      table.assemblyId,
    ),
  }),
);

export const partPricing = pgTable(
  "part_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => retrievalApplianceModels.id, { onDelete: "cascade" }),
    partId: uuid("part_id").references(() => retrievalBomParts.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull().default("encompass"),
    partNumber: text("part_number").notNull(),
    price: numeric("price"),
    currency: text("currency").notNull().default("USD"),
    availability: text("availability"),
    priceUrl: text("price_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceArtifactId: uuid("evidence_artifact_id").references(() => captureArtifacts.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    uniquePartPricing: unique("part_pricing_unq").on(
      table.modelId,
      table.source,
      table.partNumber,
    ),
  }),
);

export const modelRetrievalSummary = pgTable("model_retrieval_summary", {
  modelId: uuid("model_id")
    .primaryKey()
    .references(() => retrievalApplianceModels.id, { onDelete: "cascade" }),
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
