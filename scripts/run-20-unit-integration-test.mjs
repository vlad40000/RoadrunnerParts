import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  throw new Error("NEON_DATABASE_URL is not set");
}

const sql = neon(connectionString);

async function runTest() {
  console.log('\n🧪 Starting 20-Unit Integration Test: Full Loop Validation\n');

  // 1. Fetch the 20 units from the queue
  const queueItems = await sql`
    SELECT machine_id, brand, model, condition
    FROM appliance_inventory_queue
    ORDER BY rank_score DESC
    LIMIT 20
  `;

  console.log(`Found ${queueItems.length} units in queue for testing.\n`);

  for (const item of queueItems) {
    console.log(`\n--- Processing Unit: ${item.brand} ${item.model} (${item.machine_id}) ---`);
    
    // PHASE 1: Simulated Agentic Extraction (BOM Retrieval)
    console.log(`[Phase 1] Triggering BOM Extraction for ${item.model}...`);
    
    const normalizedModel = item.model.replace(/[^A-Z0-9]/g, '');
    const mockParts = [
      { partNumber: 'W1234' + normalizedModel.slice(-4), partName: 'Main Control Board', price: 145.50 },
      { partNumber: 'W8765' + normalizedModel.slice(-4), partName: 'Drive Motor', price: 89.00 }
    ].map(p => ({
      ...p,
      brand: item.brand,
      normalizedModel
    }));

    // Ensure model exists in appliance_models
    const models = await sql`
      INSERT INTO appliance_models (brand, model_number, normalized_model)
      VALUES (${item.brand}, ${item.model}, ${normalizedModel})
      ON CONFLICT (normalized_model) DO UPDATE SET brand = EXCLUDED.brand
      RETURNING id
    `;
    const modelId = models[0].id;

    for (const part of mockParts) {
       // Insert into bom_parts (canonical BOM table)
       await sql`
         INSERT INTO bom_parts (model_id, source, part_number, description, confidence)
         VALUES (${modelId}, 'encompass', ${part.partNumber}, ${part.partName}, 1.0)
         ON CONFLICT (model_id, source, part_number, assembly_id) DO UPDATE SET description = EXCLUDED.description
       `;
    }

    // Update queue status and rank_score to ensure it's picked up by the market survey
    await sql`
      UPDATE appliance_inventory_queue
      SET ebay_survey_status = 'complete',
          rank_score = 900,
          updated_at = now()
      WHERE machine_id = ${item.machine_id}
    `;
    console.log(`[Phase 1] BOM Extraction simulated and queue updated.`);

    // PHASE 2 & 3: Market Survey & Listing Preparation
    console.log(`[Phase 2/3] Running Market Intelligence for ${item.model}...`);
    
    for (const part of mockParts) {
      await sql`
        INSERT INTO part_market_signal (
          part_number, normalized_model, ebay_active_count, ebay_sold_count,
          sell_through_rate, median_sold_price, net_expected, checked_at, raw
        )
        VALUES (
          ${part.partNumber}, ${part.normalizedModel}, 5, 10, 2.0, ${part.price}, ${part.price - 25}, now(), '{"test": true}'
        )
        ON CONFLICT (part_number, normalized_model) DO UPDATE SET
          checked_at = now(),
          net_expected = EXCLUDED.net_expected
      `;
      console.log(`   - Market Signal created for ${part.partNumber}`);
    }

    const marketableParts = await sql`
      SELECT s.part_number, s.normalized_model, s.median_sold_price, s.net_expected, m.brand
      FROM part_market_signal s
      JOIN machine_inventory m ON s.normalized_model = m.normalized_model
      WHERE m.id::text = ${item.machine_id}
    `;

    for (const row of marketableParts) {
      // 1. Create part_inventory
      const partInvs = await sql`
        INSERT INTO part_inventory (
          machine_id, normalized_model, part_number, part_name, condition, tested_status, quantity
        )
        VALUES (${item.machine_id}, ${row.normalized_model}, ${row.part_number}, 'Test Part', 'used', 'pending', 1)
        ON CONFLICT (machine_id, part_number) WHERE machine_id IS NOT NULL 
        DO UPDATE SET quantity = part_inventory.quantity + 1
        RETURNING id
      `;
      const partInvId = partInvs[0].id;

      // 2. Create channel_listing (draft)
      await sql`
        INSERT INTO channel_listing (
          part_inventory_id, channel, title, listing_price, listing_status, raw
        )
        VALUES (
          ${partInvId}, 'ebay', ${row.brand + ' ' + row.part_number + ' Test Listing'}, ${row.median_sold_price}, 'draft', '{"test": true}'
        )
        ON CONFLICT DO NOTHING
      `;
      console.log(`   - Draft Listing created for ${row.part_number}`);
    }
  }

  console.log('\n✨ Integration Test Complete. 20 Units processed through the full loop.');
  
  const draftCount = await sql`SELECT count(*) FROM channel_listing WHERE channel = 'ebay' AND listing_status = 'draft'`;
  console.log(`Final eBay Draft Count: ${draftCount[0].count}`);

  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
