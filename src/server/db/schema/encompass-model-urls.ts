import { bigserial, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const encompassModelUrls = pgTable(
  "encompass_model_urls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    brand: text("brand"),
    encompassRoute: text("encompass_route").notNull(),
    encompassId: text("encompass_id").notNull(),
    modelNumber: text("model_number").notNull(),
    encodedModelNumber: text("encoded_model_number").notNull(),
    normalizedModel: text("normalized_model").notNull(),
    url: text("url").notNull(),
    sourceFile: text("source_file"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    encompassModelUrlsRouteIdx: uniqueIndex("encompass_model_urls_normalized_model_route_idx").on(
      t.normalizedModel,
      t.encompassRoute,
      t.encompassId,
    ),
    encompassModelUrlsNormalizedIdx: uniqueIndex("encompass_model_urls_normalized_model_idx").on(
      t.normalizedModel,
    ),
  }),
);
