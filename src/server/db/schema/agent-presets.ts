import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const agentPresets = pgTable("agent_preset", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  scenarioType: text("scenario_type"), // Optional link to PromptScenarioType
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  metadata: text("metadata"), // For storing version info or category
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
