import { jsonb, pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const promptScenarios = pgTable("prompt_scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template").notNull(),
  requiredInputs: jsonb("required_inputs")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  expectedJsonShape: jsonb("expected_json_shape"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptRuns = pgTable("prompt_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenarioId: uuid("scenario_id").references(() => promptScenarios.id),
  modelA: text("model_a"),
  modelB: text("model_b"),
  inputPayload: jsonb("input_payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptRunOutputs = pgTable("prompt_run_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => promptRuns.id, { onDelete: "cascade" })
    .notNull(),
  slotId: text("slot_id").notNull(),
  modelName: text("model_name").notNull(),
  rawOutput: text("raw_output"),
  parsedJson: jsonb("parsed_json"),
  validationStatus: text("validation_status"),
  errors: jsonb("errors")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
