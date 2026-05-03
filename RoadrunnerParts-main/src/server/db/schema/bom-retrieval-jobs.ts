import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const bomRetrievalJobs = pgTable(
  "bom_retrieval_jobs",
  {
    id: text("id").primaryKey(),
    bomJobId: text("bom_job_id").notNull(),
    provider: text("provider").notNull().default("encompass"),
    jobType: text("job_type").notNull().default("encompass_bom_pricing"),
    status: text("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(100),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    model: text("model").notNull(),
    brand: text("brand"),
    sourceUrl: text("source_url"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resultSummary: jsonb("result_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorText: text("error_text"),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    bomRetrievalJobsStatusIdx: index("bom_retrieval_jobs_status_idx").on(
      table.status,
      table.priority,
      table.createdAt,
    ),
    bomRetrievalJobsBomJobIdx: index("bom_retrieval_jobs_bom_job_idx").on(
      table.bomJobId,
    ),
    bomRetrievalJobsProviderModelIdx: index(
      "bom_retrieval_jobs_provider_model_idx",
    ).on(table.provider, table.model),
    bomRetrievalJobsDedupIdx: uniqueIndex("bom_retrieval_jobs_dedup_idx").on(
      table.bomJobId,
      table.provider,
      table.jobType,
      table.model,
    ),
  }),
);
