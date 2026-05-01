import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/server/db/schema/provider-seeds.ts";
import { sql } from "drizzle-orm";
import fs from "fs";
import { parse } from "csv-parse/sync";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = drizzle(neon(databaseUrl));

  const tableType = process.argv[2]; // 'routes', 'sections', 'parts'
  const filePath = process.argv[3];

  if (!tableType || !filePath) {
    console.log("Usage: node scripts/seed-provider-data.mjs <routes|sections|parts> <path-to-csv>");
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Ingesting ${records.length} records into ${tableType}...`);

  if (tableType === "routes") {
    for (const row of records) {
      await db.insert(schema.providerModelRoutes).values({
        manufacturerFamily: row.manufacturer_family,
        brand: row.brand,
        brandCode: row.brand_code,
        model: row.model,
        modelFamily: row.model_family,
        applianceType: row.appliance_type,
        fuelType: row.fuel_type,
        serialPrefix: row.serial_prefix,
        provider: row.provider,
        providerModelUrl: row.provider_model_url,
        providerOptionValue: row.provider_option_value,
        providerAssemblyUrl: row.provider_assembly_url,
        sourceStatus: row.source_status,
        sourceFile: filePath,
        sourceRow: records.indexOf(row) + 1,
      }).onConflictDoUpdate({
        target: [
          schema.providerModelRoutes.provider,
          schema.providerModelRoutes.model,
          schema.providerModelRoutes.providerOptionValue
        ],
        set: {
          providerModelUrl: row.provider_model_url,
          providerAssemblyUrl: row.provider_assembly_url,
          updatedAt: new Date(),
        }
      });
    }
  } else if (tableType === "sections") {
    for (const row of records) {
      await db.insert(schema.providerAssemblySections).values({
        manufacturerFamily: row.manufacturer_family,
        brand: row.brand,
        brandCode: row.brand_code,
        model: row.model,
        modelFamily: row.model_family,
        applianceType: row.appliance_type,
        fuelType: row.fuel_type,
        serialPrefix: row.serial_prefix,
        provider: row.provider,
        providerOptionValue: row.provider_option_value,
        providerAssemblyUrl: row.provider_assembly_url,
        diagramUrl: row.diagram_url,
        sectionSeq: row.section_seq ? parseInt(row.section_seq, 10) : null,
        sectionLabelRaw: row.section_label_raw,
        sectionNameClean: row.section_name_clean,
        normalizedSection: row.normalized_section,
        sectionFamily: row.section_family,
        imageUrl: row.image_url,
        sourceStatus: row.source_status,
        sourceFile: filePath,
        sourceRow: records.indexOf(row) + 1,
      }).onConflictDoUpdate({
        target: [
          schema.providerAssemblySections.provider,
          schema.providerAssemblySections.model,
          schema.providerAssemblySections.providerOptionValue,
          schema.providerAssemblySections.sectionSeq,
          schema.providerAssemblySections.sectionNameClean
        ],
        set: {
          diagramUrl: row.diagram_url,
          imageUrl: row.image_url,
        }
      });
    }
  } else if (tableType === "parts") {
    for (const row of records) {
      await db.insert(schema.providerPartSeedRows).values({
        manufacturerFamily: row.manufacturer_family,
        brand: row.brand,
        brandCode: row.brand_code,
        model: row.model,
        modelFamily: row.model_family,
        applianceType: row.appliance_type,
        fuelType: row.fuel_type,
        serialPrefix: row.serial_prefix,
        provider: row.provider,
        providerModelUrl: row.provider_model_url,
        providerAssemblyUrl: row.provider_assembly_url,
        diagramUrl: row.diagram_url,
        sectionLabelRaw: row.section_label_raw,
        sectionNameClean: row.section_name_clean,
        normalizedSection: row.normalized_section,
        sectionFamily: row.section_family,
        diagramNumber: row.diagram_number,
        originalPartNumber: row.original_part_number,
        currentServicePartNumber: row.current_service_part_number,
        description: row.description,
        nlaStatus: row.nla_status === "true" || row.nla_status === "1",
        replacementNote: row.replacement_note,
        imageUrl: row.image_url,
        sourceStatus: row.source_status,
        sourceFile: filePath,
        sourceRow: records.indexOf(row) + 1,
      }).onConflictDoUpdate({
        target: [
          schema.providerPartSeedRows.provider,
          schema.providerPartSeedRows.model,
          schema.providerPartSeedRows.sectionNameClean,
          schema.providerPartSeedRows.diagramNumber,
          schema.providerPartSeedRows.currentServicePartNumber
        ],
        set: {
          description: row.description,
          nlaStatus: row.nla_status === "true" || row.nla_status === "1",
          replacementNote: row.replacement_note,
        }
      });
    }
  }

  console.log("Ingestion complete.");
}

main().catch(console.error);
