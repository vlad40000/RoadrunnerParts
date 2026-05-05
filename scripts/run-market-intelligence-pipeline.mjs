import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { scrapeEbayActive, scrapeEbaySold } from "../src/lib/ebay-scraper.ts";
import { generateEbayTitle, generateEbayDescription } from "../src/lib/ebay-listing-gen.ts";

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

const limit = Number(args.get("limit") || 20);
const dryRun = args.get("dry-run") === "true";
const minNetExpected = parseFloat(args.get("min-net") || "15.00");

/**
 * MARKET-SIGNAL INTELLIGENCE PIPELINE
 * 
 * Orchestrates:
 * 1. Market Survey (eBay Scrape -> part_market_signal)
 * 2. Listing Preparation (Signal Analysis -> part_inventory -> channel_listing draft)
 */

async function runPipeline() {
  console.log(`\n🚀 Starting Market-Signal Intelligence Pipeline (Limit: ${limit}, MinNet: $${minNetExpected})\n`);

  // --- PHASE 1: MARKET SURVEY ---
  console.log("--- PHASE 1: MARKET SURVEY ---");
  const partsToSurvey = await sql.query(`
    SELECT b.part_number, b.normalized_model, b.part_name, m.brand
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

  console.log(`Found ${partsToSurvey.length} parts requiring fresh market signals.`);

  for (const part of partsToSurvey) {
    console.log(`Surveying: ${part.part_number} (${part.part_name})`);
    try {
      const active = await scrapeEbayActive(part.part_number);
      const sold = await scrapeEbaySold(part.part_number);
      
      const activeCount = active.length;
      const soldCount = sold.length;
      const sellThrough = activeCount > 0 ? soldCount / activeCount : (soldCount > 0 ? 1 : 0);
      
      const soldPrices = sold.map(s => s.price).filter(p => p > 0);
      const medianSold = soldPrices.length > 0 ? soldPrices.sort((a,b) => a-b)[Math.floor(soldPrices.length/2)] : 0;
      
      // Net expected calculation (conservative)
      const fees = medianSold * 0.15;
      const ship = 12.00; // Average for parts
      const pack = 2.00;
      const labor = 5.00;
      const netExpected = medianSold > 0 ? medianSold - fees - ship - pack - labor : 0;

      if (!dryRun) {
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
          part.part_number, 
          part.normalized_model, 
          activeCount, 
          soldCount, 
          sellThrough, 
          medianSold, 
          netExpected, 
          JSON.stringify({ active_listings: active, sold_listings: sold })
        ]);
        console.log(`✅ Signal updated for ${part.part_number} (Net: $${netExpected.toFixed(2)})`);
      } else {
        console.log(`[DRY RUN] Would update signal for ${part.part_number} (Net: $${netExpected.toFixed(2)})`);
      }
      
      // Jitter delay between scrapes
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    } catch (err) {
      console.error(`❌ Failed to survey ${part.part_number}:`, err.message);
    }
  }

  // --- PHASE 2: LISTING PREPARATION ---
  console.log("\n--- PHASE 2: LISTING PREPARATION ---");
  const marketableParts = await sql.query(`
    SELECT 
      s.part_number, 
      s.normalized_model, 
      s.median_sold_price,
      s.net_expected,
      m.id AS machine_id,
      m.brand,
      b.part_name
    FROM part_market_signal s
    JOIN machine_inventory m ON s.normalized_model = m.normalized_model
    JOIN bom_part b ON s.part_number = b.part_number AND s.normalized_model = b.normalized_model
    LEFT JOIN part_inventory i ON s.part_number = i.part_number AND m.id = i.machine_id
    WHERE s.net_expected >= $1
      AND i.id IS NULL
    ORDER BY s.net_expected DESC
    LIMIT $2
  `, [minNetExpected, limit]);

  console.log(`Found ${marketableParts.length} parts meeting profitability threshold.`);

  for (const row of marketableParts) {
    console.log(`Preparing: ${row.part_number} ($${row.median_sold_price} MSRP)`);
    
    const title = generateEbayTitle({
      brand: row.brand,
      partNumber: row.part_number,
      partName: row.part_name,
      condition: "used",
      model: row.normalized_model
    });
    
    const description = generateEbayDescription({
      brand: row.brand,
      partNumber: row.part_number,
      partName: row.part_name,
      condition: "used",
      model: row.normalized_model
    });
    
    if (!dryRun) {
      // 1. Create part_inventory record
      const [partInv] = await sql.query(`
        INSERT INTO part_inventory (
          machine_id, normalized_model, part_number, part_name, condition, tested_status, quantity
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [row.machine_id, row.normalized_model, row.part_number, row.part_name, "used", "pending", 1]);
      
      // 2. Create channel_listing record (draft)
      await sql.query(`
        INSERT INTO channel_listing (
          part_inventory_id, channel, title, listing_price, listing_status, raw
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        partInv.id, 
        "ebay", 
        title, 
        row.median_sold_price, 
        "draft", 
        JSON.stringify({ description, generated_at: new Date().toISOString(), auto_orchestrated: true })
      ]);
      console.log(`✅ Draft listing created for ${row.part_number}`);
    } else {
      console.log(`[DRY RUN] Would create draft for ${row.part_number}: "${title}"`);
    }
  }

  console.log("\n✨ Pipeline Complete.\n");
}

runPipeline().catch(console.error);
