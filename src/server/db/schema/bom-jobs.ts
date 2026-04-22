import {
  jsonb,
  pgTable,
  text,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const bomJobs = pgTable("bom_jobs", {
  id: text("id").primaryKey(),

  jobStage: text("job_stage").notNull().default("created"),
  resultStatus: text("result_status"),

  brand: text("brand"),
  model: text("model"),
  serial: text("serial"),
  productType: text("product_type"),

  coverageScore: real("coverage_score").notNull().default(0),
  rawRowCount: integer("raw_row_count").notNull().default(0),
  uniqueRowCount: integer("unique_row_count").notNull().default(0),

  expectedPartsTotal: integer("expected_parts_total"),
  expectedPartsSource: text("expected_parts_source"),
  actualUniqueParts: integer("actual_unique_parts"),
  coveragePct: real("coverage_pct"),

  uploadedFiles: jsonb("uploaded_files")
    .$type<
      Array<{
        url: string;
        pathname: string;
        originalName: string;
        mimeType: string;
        size: number;
        category: "identity" | "diagram";
      }>
    >()
    .notNull()
    .default(sql`'[]'::jsonb`),

  identity: jsonb("identity").$type<Record<string, unknown> | null>(),
  diagramParse: jsonb("diagram_parse").$type<Record<string, unknown> | null>(),

  retrievedSources: jsonb("retrieved_sources")
    .$type<
      Array<{
        sourceUrl: string;
        sourceType: string;
        sectionName?: string;
        text?: string;
      }>
    >()
    .notNull()
    .default(sql`'[]'::jsonb`),

  extractedRowsRaw: jsonb("extracted_rows_raw")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  finalRows: jsonb("final_rows")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  unmatchedCallouts: jsonb("unmatched_callouts")
    .$type<Array<string | number>>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  issues: jsonb("issues")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  errorText: text("error_text"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
