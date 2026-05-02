import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function ingestSeeds(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Ingesting seeds from ${filePath}...`);

  try {
    // 1. Ingest Model Routes
    if (data.model_routes) {
      console.log(`Ingesting ${data.model_routes.length} model routes...`);
      for (const route of data.model_routes) {
        await sql`
          INSERT INTO provider_model_routes (
            manufacturer_family, brand, brand_code, model, model_family,
            appliance_type, fuel_type, serial_prefix, provider,
            provider_model_url, provider_option_value, provider_assembly_url,
            source_status, source_file, source_row
          ) VALUES (
            ${route.manufacturerFamily}, ${route.brand}, ${route.brandCode}, ${route.model}, ${route.modelFamily},
            ${route.applianceType}, ${route.fuelType}, ${route.serialPrefix}, ${route.provider},
            ${route.providerModelUrl}, ${route.providerOptionValue}, ${route.providerAssemblyUrl},
            ${route.sourceStatus}, ${route.sourceFile}, ${route.sourceRow}
          ) ON CONFLICT (provider, model, COALESCE(provider_option_value, '')) DO UPDATE SET
            provider_model_url = EXCLUDED.provider_model_url,
            provider_assembly_url = EXCLUDED.provider_assembly_url,
            updated_at = now();
        `;
      }
    }

    // 2. Ingest Assembly Sections
    if (data.assembly_sections) {
      console.log(`Ingesting ${data.assembly_sections.length} assembly sections...`);
      for (const section of data.assembly_sections) {
        await sql`
          INSERT INTO provider_assembly_sections (
            manufacturer_family, brand, brand_code, model, model_family,
            appliance_type, fuel_type, serial_prefix, provider,
            provider_option_value, provider_assembly_url, diagram_url,
            section_seq, section_label_raw, section_name_clean,
            normalized_section, section_family, image_url,
            source_status, source_file, source_row
          ) VALUES (
            ${section.manufacturerFamily}, ${section.brand}, ${section.brandCode}, ${section.model}, ${section.modelFamily},
            ${section.applianceType}, ${section.fuelType}, ${section.serialPrefix}, ${section.provider},
            ${section.providerOptionValue}, ${section.providerAssemblyUrl}, ${section.diagramUrl},
            ${section.sectionSeq}, ${section.sectionLabelRaw}, ${section.sectionNameClean},
            ${section.normalizedSection}, ${section.sectionFamily}, ${section.imageUrl},
            ${section.sourceStatus}, ${section.sourceFile}, ${section.sourceRow}
          ) ON CONFLICT (provider, model, COALESCE(provider_option_value, ''), COALESCE(section_seq, -1), COALESCE(section_name_clean, '')) DO UPDATE SET
            provider_assembly_url = EXCLUDED.provider_assembly_url,
            diagram_url = EXCLUDED.diagram_url,
            image_url = EXCLUDED.image_url;
        `;
      }
    }

    // 3. Ingest Part Seed Rows
    if (data.part_seed_rows) {
      console.log(`Ingesting ${data.part_seed_rows.length} part seed rows...`);
      for (const row of data.part_seed_rows) {
        await sql`
          INSERT INTO provider_part_seed_rows (
            manufacturer_family, brand, brand_code, model, model_family,
            appliance_type, fuel_type, serial_prefix, provider,
            provider_model_url, provider_assembly_url, diagram_url,
            section_label_raw, section_name_clean, normalized_section,
            section_family, diagram_number, original_part_number,
            current_service_part_number, description, nla_status,
            replacement_note, image_url, source_status, source_file, source_row
          ) VALUES (
            ${row.manufacturerFamily}, ${row.brand}, ${row.brandCode}, ${row.model}, ${row.modelFamily},
            ${row.applianceType}, ${row.fuelType}, ${row.serialPrefix}, ${row.provider},
            ${row.providerModelUrl}, ${row.providerAssemblyUrl}, ${row.diagramUrl},
            ${row.sectionLabelRaw}, ${row.sectionNameClean}, ${row.normalizedSection},
            ${row.sectionFamily}, ${row.diagramNumber}, ${row.originalPartNumber},
            ${row.currentServicePartNumber}, ${row.description}, ${row.nlaStatus},
            ${row.replacementNote}, ${row.imageUrl}, ${row.sourceStatus}, ${row.sourceFile}, ${row.sourceRow}
          ) ON CONFLICT (provider, model, COALESCE(section_name_clean, ''), COALESCE(diagram_number, ''), COALESCE(current_service_part_number, original_part_number, '')) DO UPDATE SET
            description = EXCLUDED.description,
            nla_status = EXCLUDED.nla_status,
            replacement_note = EXCLUDED.replacement_note,
            image_url = EXCLUDED.image_url;
        `;
      }
    }

    console.log('✅ Ingestion completed successfully.');
  } catch (err) {
    console.error('❌ Ingestion failed:', err);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node scripts/ingest-provider-seeds.mjs <path_to_json>');
  process.exit(1);
}

ingestSeeds(args[0]);
