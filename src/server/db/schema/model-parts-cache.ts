import { pgTable, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const modelPartsCache = pgTable('model_parts_cache', {
  id: text('id').primaryKey(), // This will be the normalized model number
  normalizedModel: text('normalized_model').notNull(),
  brand: text('brand'),
  category: text('category'),
  parts: jsonb('parts').notNull().$type<any[]>(),
  msrp: text('msrp'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    normalizedModelIdx: uniqueIndex('normalized_model_idx').on(table.normalizedModel),
  };
});
