import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString) {
  throw new Error("NEON_DATABASE_URL is not set");
}

const sql = neon(connectionString);

const testModels = [
  { brand: 'Whirlpool', model: 'WDT730PAHZ0', type: 'Dishwasher' },
  { brand: 'Samsung', model: 'RF28R7351SR', type: 'Refrigerator' },
  { brand: 'LG', model: 'WM3400CW', type: 'Washer' },
  { brand: 'GE', model: 'GFE28GYNFS', type: 'Refrigerator' },
  { brand: 'Maytag', model: 'MVW6200KW', type: 'Washer' },
  { brand: 'KitchenAid', model: 'KRFC300ESS', type: 'Refrigerator' },
  { brand: 'Bosch', model: 'SHP878ZD5N', type: 'Dishwasher' },
  { brand: 'Kenmore', model: '11025132411', type: 'Washer' },
  { brand: 'Frigidaire', model: 'FFTR1814TW', type: 'Refrigerator' },
  { brand: 'Amana', model: 'NED4655EW', type: 'Dryer' },
  { brand: 'Whirlpool', model: 'WED4815EW1', type: 'Dryer' },
  { brand: 'Samsung', model: 'WA50R5400AV', type: 'Washer' },
  { brand: 'LG', model: 'LFXS26973S', type: 'Refrigerator' },
  { brand: 'GE', model: 'GTW465ASNWW', type: 'Washer' },
  { brand: 'Maytag', model: 'MED6230HW', type: 'Dryer' },
  { brand: 'KitchenAid', model: 'KDTE204KPS', type: 'Dishwasher' },
  { brand: 'Frigidaire', model: 'FFCD2413US', type: 'Dishwasher' },
  { brand: 'Amana', model: 'AMAR67S1B', type: 'Refrigerator' },
  { brand: 'Whirlpool', model: 'WRS325SDHZ', type: 'Refrigerator' },
  { brand: 'GE', model: 'GDF530PSM1SS', type: 'Dishwasher' }
];

async function seed() {
  console.log('Seeding 20 test units into machine_inventory and appliance_inventory_queue...');

  for (const item of testModels) {
    // 1. Insert into machine_inventory
    const normalized = item.model.replace(/[^A-Z0-9]/g, '');
    const machines = await sql`
      INSERT INTO machine_inventory (brand, model, normalized_model, appliance_type, condition, donor_status)
      VALUES (${item.brand}, ${item.model}, ${normalized}, ${item.type}, 'used', 'ready_for_extraction')
      RETURNING id
    `;
    const machineId = machines[0].id;

    // 2. Insert into appliance_inventory_queue
    await sql`
      INSERT INTO appliance_inventory_queue (machine_id, brand, model, condition, rank_score, queue_band, recommended_action)
      VALUES (${machineId}, ${item.brand}, ${item.model}, 'used', ${Math.floor(Math.random() * 100)}, 'active_extraction', 'extract_bom')
      ON CONFLICT (machine_id) DO NOTHING
    `;
    
    console.log(`- Queued ${item.brand} ${item.model}`);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
