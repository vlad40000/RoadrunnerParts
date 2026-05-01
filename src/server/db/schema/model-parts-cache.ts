import { pgTable, text, timestamp, jsonb, uniqueIndex, integer, real } from 'drizzle-orm/pg-core';

export const modelPartsCache = pgTable('model_parts_cache', {
  id: text('id').primaryKey(), // This will be the normalized model number
  normalizedModel: text('normalized_model').notNull(),
  brand: text('brand'),
  category: text('category'),
  parts: jsonb('parts').notNull().$type<any[]>(),
  isExhaustive: text('is_exhaustive'), // 'true' or 'false'
  msrp: text('msrp'),
  retrievalState: text('retrieval_state').default('unknown'),
  expectedPartsTotal: integer('expected_parts_total'),
  expectedPartsSource: text('expected_parts_source'),
  actualUniqueParts: integer('actual_unique_parts'),
  coveragePct: real('coverage_pct'),
  truthSource: text('truth_source'),
  sourceStrategy: text('source_strategy'),
  fallbackSources: jsonb('fallback_sources').default([]),
  sourceSummary: jsonb('source_summary').default([]),
  rejectedParts: jsonb('rejected_parts').default([]),
  validationVersion: text('validation_version'),
  applianceType: text('appliance_type'),
  fuelType: text('fuel_type'),
  lastVerifiedAt: timestamp('last_verified_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    normalizedModelIdx: uniqueIndex('normalized_model_idx').on(table.normalizedModel),
  };
});
