import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const bomTelemetry = pgTable("bom_telemetry", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: text("job_id"),
  slotId: text("slot_id"),
  event: text("event").notNull(), // e.g., "identity_extraction_attempt"
  status: text("status").notNull(), // e.g., "success", "failed"
  model: text("model"),
  brand: text("brand"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
