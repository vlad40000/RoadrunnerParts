import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

/**
 * Normalizes a model number for consistent cache lookup.
 */
function normalizeModelKey(model) {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sync() {
  console.log('Syncing Legacy Appliance BOMs to Model Parts Cache...\n');

  try {
    // 1. Fetch data from the old table
    const legacyBoms = await sql`SELECT * FROM appliance_boms`;
    console.log(`Found ${legacyBoms.length} legacy BOMs.`);

    for (const bom of legacyBoms) {
      const normalizedModel = normalizeModelKey(bom.model);
      if (!normalizedModel) continue;

      console.log(`Processing ${bom.model} -> ${normalizedModel}...`);

      // Upsert into model_parts_cache
      await sql`
        INSERT INTO model_parts_cache (
          id, 
          normalized_model, 
          parts, 
          is_exhaustive, 
          msrp, 
          updated_at, 
          created_at
        ) 
        VALUES (
          ${normalizedModel}, 
          ${normalizedModel}, 
          ${JSON.stringify(bom.parts)}, 
          'true', 
          ${bom.msrp ? bom.msrp.toString() : null}, 
          now(), 
          now()
        )
        ON CONFLICT (normalized_model) DO UPDATE SET
          parts = EXCLUDED.parts,
          is_exhaustive = EXCLUDED.is_exhaustive,
          msrp = EXCLUDED.msrp,
          updated_at = now();
      `;

      // Also create a entry in appliance_parts_cache for the new UI layer
      await sql`
        INSERT INTO appliance_parts_cache (
          normalized_model,
          raw_model,
          parts_json,
          summary,
          truth_source,
          source_strategy,
          created_at,
          updated_at
        )
        VALUES (
          ${normalizedModel},
          ${bom.model},
          ${JSON.stringify(bom.parts)},
          ${`Legacy imported BOM for ${bom.model}`},
          'Legacy Export',
          'legacy-import',
          now(),
          now()
        )
        ON CONFLICT (normalized_model) DO UPDATE SET
          parts_json = EXCLUDED.parts_json,
          updated_at = now();
      `;
    }

    console.log('\n✅ Data sync completed.');
  } catch (err) {
    console.error('❌ Sync failed:', err);
  }
}

sync();
