import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { scrapeEbayActive, scrapeEbaySold } from "../src/lib/ebay-scraper.ts";

dotenv.config({ path: ".env.local" });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL/NEON_DATABASE_URL");

const sql = neon(databaseUrl);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const limit = Number(args.get("limit") || 50);
const dryRun = args.get("dry-run") === "true";

async function loadPartsToSurvey() {
  // Survey parts from BOM for high-priority machines
  const rows = await sql.query(`
    SELECT b.part_number, b.normalized_model, b.part_name
    FROM bom_part b
    JOIN machine_inventory m ON b.normalized_model = m.normalized_model
    JOIN appliance_inventory_queue q ON m.id::text = q.machine_id
    LEFT JOIN part_market_signal s
      ON b.part_number = s.part_number
     AND b.normalized_model = s.normalized_model
    WHERE q.rank_score >= 650
      AND (s.checked_at IS NULL OR s.checked_at < now() - interval '7 days')
    LIMIT $1
  `, [limit]);
  return rows;
}

async function processPart(row) {
  console.log(`Surveying eBay for part: ${row.part_number} (${row.part_name})`);
  
  try {
    const active = await scrapeEbayActive(row.part_number);
    const sold = await scrapeEbaySold(row.part_number);
    
    const activeCount = active.length;
    const soldCount = sold.length;
    const sellThrough = activeCount > 0 ? soldCount / activeCount : (soldCount > 0 ? 1 : 0);
    
    const soldPrices = sold.map(s => s.price).filter(p => p > 0);
    const medianSold = soldPrices.length > 0 ? soldPrices.sort((a,b) => a-b)[Math.floor(soldPrices.length/2)] : 0;
    
    // Net expected calculation
    const fees = medianSold * 0.15;
    const ship = 10.00; // Estimated
    const pack = 1.50;
    const labor = 5.00;
    const netExpected = medianSold > 0 ? medianSold - fees - ship - pack - labor : 0;
    
    if (dryRun) {
      console.log(`[DRY RUN] ${row.part_number}: Active=${activeCount}, Sold=${soldCount}, NetExpected=${netExpected.toFixed(2)}`);
      return;
    }
    
    await sql.query(`
      INSERT INTO part_market_signal (
        part_number, normalized_model, ebay_active_count, ebay_sold_count,
        sell_through_rate, median_sold_price, net_expected, checked_at, raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
      ON CONFLICT (part_number, normalized_model) DO UPDATE SET
        ebay_active_count = EXCLUDED.ebay_active_count,
        ebay_sold_count = EXCLUDED.ebay_sold_count,
        sell_through_rate = EXCLUDED.sell_through_rate,
        median_sold_price = EXCLUDED.median_sold_price,
        net_expected = EXCLUDED.net_expected,
        checked_at = now(),
        raw = EXCLUDED.raw
    `, [
      row.part_number, 
      row.normalized_model, 
      activeCount, 
      soldCount, 
      sellThrough, 
      medianSold, 
      netExpected, 
      JSON.stringify({ active_listings: active, sold_listings: sold })
    ]);
    
    console.log(`Updated signal for ${row.part_number}`);
  } catch (err) {
    console.error(`Failed to survey ${row.part_number}: ${err.message}`);
  }
}

async function main() {
  const rows = await loadPartsToSurvey();
  console.log(`Found ${rows.length} parts to survey.`);
  
  for (const row of rows) {
    await processPart(row);
    // Sleep a bit to avoid getting blocked
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("Done.");
}

main().catch(console.error);
