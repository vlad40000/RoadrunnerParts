import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bomJobGroups = pgTable("bom_job_groups", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  source: text("source").notNull().default("sears"),
  sourceUrl: text("source_url").notNull(),
  sourceText: text("source_text"),
  groupKey: text("group_key").notNull(),
  groupName: text("group_name").notNull(),
  groupOrder: integer("group_order").notNull().default(0),
  status: text("status").notNull().default("pending"),
  rawRowCount: integer("raw_row_count").notNull().default(0),
  acceptedRowCount: integer("accepted_row_count").notNull().default(0),
  errorText: text("error_text"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
