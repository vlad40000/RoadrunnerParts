import { pgTable, text, timestamp, jsonb, uniqueIndex, integer, real, boolean } from 'drizzle-orm/pg-core';

export const modelPartsCache = pgTable('model_parts_cache', {
  id: text('id').primaryKey(),
  normalizedModel: text('normalized_model').notNull(),
  brand: text('brand'),
  category: text('category'),
  parts: jsonb('parts').notNull().$type<any[]>(),
  isExhaustive: text('is_exhaustive'), // 'true' or 'false'
  msrp: text('msrp'),
  
  // v2.0 metadata
  retrievalState: text('retrieval_state').default('unknown'),
  expectedPartsTotal: integer('expected_parts_total'),
  expectedPartsSource: text('expected_parts_source'),
  trustedTotalPartCount: integer('trusted_total_part_count'),
  trustedTotalCountSource: text('trusted_total_count_source'),
  trustedTotalCountSourceUrl: text('trusted_total_count_source_url'),
  trustedTotalCountCheckedAt: timestamp('trusted_total_count_checked_at'),
  actualCanonicalPartCount: integer('actual_canonical_part_count'),
  partsComplete: boolean('parts_complete'),
  actualUniqueParts: integer('actual_unique_parts'),
  coveragePct: real('coverage_pct'),
  truthSource: text('truth_source'),
  sourceStrategy: text('source_strategy'),
  fallbackSources: jsonb('fallback_sources').default([]).$type<any[]>(),
  sourceSummary: jsonb('source_summary').default([]).$type<any[]>(),
  rejectedParts: jsonb('rejected_parts').default([]).$type<any[]>(),
  validationVersion: text('validation_version').default('1.0'),
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
