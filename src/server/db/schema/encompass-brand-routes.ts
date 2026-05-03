import { pgTable, text, boolean } from "drizzle-orm/pg-core";

export const encompassBrandRoutes = pgTable("encompass_brand_routes", {
  brand: text("brand").primaryKey(),
  abv: text("abv").notNull(),
  targetBrand: text("target_brand").notNull(),
  explodedViewSearchUrl: text("exploded_view_search_url").notNull(),
  isAliasOrRollup: boolean("is_alias_or_rollup").notNull(),
  explodedViewAssemblyUrlPattern: text("exploded_view_assembly_url_pattern"),
});
