import { pgTable, bigserial, text, timestamp, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const providerModelRoutes = pgTable('provider_model_routes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  manufacturerFamily: text('manufacturer_family'),
  brand: text('brand'),
  brandCode: text('brand_code'),
  model: text('model').notNull(),
  modelFamily: text('model_family'),
  applianceType: text('appliance_type'),
  fuelType: text('fuel_type'),
  serialPrefix: text('serial_prefix'),
  provider: text('provider').notNull(),
  providerModelUrl: text('provider_model_url'),
  providerOptionValue: text('provider_option_value'),
  providerAssemblyUrl: text('provider_assembly_url'),
  sourceStatus: text('source_status'),
  sourceFile: text('source_file'),
  sourceRow: integer('source_row'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerModelRoutesUnqIdx: uniqueIndex('provider_model_routes_unq_idx').on(
    t.provider,
    t.model,
    sql`coalesce(${t.providerOptionValue}, '')`
  ),
}));

export const providerAssemblySections = pgTable('provider_assembly_sections', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  manufacturerFamily: text('manufacturer_family'),
  brand: text('brand'),
  brandCode: text('brand_code'),
  model: text('model').notNull(),
  modelFamily: text('model_family'),
  applianceType: text('appliance_type'),
  fuelType: text('fuel_type'),
  serialPrefix: text('serial_prefix'),
  provider: text('provider').notNull(),
  providerOptionValue: text('provider_option_value'),
  providerAssemblyUrl: text('provider_assembly_url'),
  diagramUrl: text('diagram_url'),
  sectionSeq: integer('section_seq'),
  sectionLabelRaw: text('section_label_raw'),
  sectionNameClean: text('section_name_clean'),
  normalizedSection: text('normalized_section'),
  sectionFamily: text('section_family'),
  imageUrl: text('image_url'),
  sourceStatus: text('source_status'),
  sourceFile: text('source_file'),
  sourceRow: integer('source_row'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerAssemblySectionsUnqIdx: uniqueIndex('provider_assembly_sections_unq_idx').on(
    t.provider,
    t.model,
    sql`coalesce(${t.providerOptionValue}, '')`,
    sql`coalesce(${t.sectionSeq}, -1)`,
    sql`coalesce(${t.sectionNameClean}, '')`
  ),
}));

export const providerPartSeedRows = pgTable('provider_part_seed_rows', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  manufacturerFamily: text('manufacturer_family'),
  brand: text('brand'),
  brandCode: text('brand_code'),
  model: text('model').notNull(),
  modelFamily: text('model_family'),
  applianceType: text('appliance_type'),
  fuelType: text('fuel_type'),
  serialPrefix: text('serial_prefix'),
  provider: text('provider').notNull(),
  providerModelUrl: text('provider_model_url'),
  providerAssemblyUrl: text('provider_assembly_url'),
  diagramUrl: text('diagram_url'),
  sectionLabelRaw: text('section_label_raw'),
  sectionNameClean: text('section_name_clean'),
  normalizedSection: text('normalized_section'),
  sectionFamily: text('section_family'),
  diagramNumber: text('diagram_number'),
  originalPartNumber: text('original_part_number'),
  currentServicePartNumber: text('current_service_part_number'),
  description: text('description'),
  nlaStatus: boolean('nla_status').default(false),
  replacementNote: text('replacement_note'),
  imageUrl: text('image_url'),
  sourceStatus: text('source_status'),
  sourceFile: text('source_file'),
  sourceRow: integer('source_row'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerPartSeedRowsUnqIdx: uniqueIndex('provider_part_seed_rows_unq_idx').on(
    t.provider,
    t.model,
    sql`coalesce(${t.sectionNameClean}, '')`,
    sql`coalesce(${t.diagramNumber}, '')`,
    sql`coalesce(${t.currentServicePartNumber}, ${t.originalPartNumber}, '')`
  ),
}));
