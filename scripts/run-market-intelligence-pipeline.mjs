import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { scrapeEbayActive, scrapeEbaySold } from "../src/lib/ebay-scraper.ts";
import { generateEbayTitle, generateEbayDescription } from "../src/lib/ebay-listing-gen.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    SELECT b.part_number, am.normalized_model, b.description as part_name, m.brand
    FROM bom_parts b
    JOIN appliance_models am ON b.model_id = am.id
    JOIN machine_inventory m ON am.normalized_model = m.normalized_model
    JOIN appliance_inventory_queue q ON m.id::text = q.machine_id
    LEFT JOIN part_market_signal s
      ON b.part_number = s.part_number
     AND am.normalized_model = s.normalized_model
    WHERE q.rank_score >= 650
      AND (s.checked_at IS NULL OR s.checked_at < now() - interval '7 days')
    LIMIT $1
  `, [limit]);

  console.log(`Found ${partsToSurvey.length} parts requiring fresh market signals.`);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-lite-preview",
    tools: [{ googleSearch: {} }]
  });

  for (const part of partsToSurvey) {
    console.log(`\n🔍 Agentic Survey: ${part.part_number} (${part.part_name})`);
    try {
      const prompt = `Perform a high-fidelity market analysis for appliance part number "${part.part_number}" (${part.part_name}).
      
      RESEARCH STEPS:
      1. Use Google Search to find at least 5 "Sold" listings on eBay for this exact part.
      2. Identify the lowest "Active" price for a Used version of this part on eBay.
      3. Reference the retail price on Encompass or PartsDr as an anchor.
      
      CALCULATION RULES:
      - medianSoldPrice: Median of the 5+ sold items found.
      - netExpected: (medianSoldPrice * 0.85) - 19.50 (Shipping: $12.50, Processing: $7.00).
      - confidence: 1.0 if 5+ sold items found, 0.5 if 1-2 found, 0.1 if none.
      
      CITATIONS:
      - Include the URLs of the specific eBay listings used to calculate the median.
      
      RETURN FORMAT (JSON ONLY):
      {
        "medianSoldPrice": number,
        "activeCount": number,
        "soldCount": number,
        "lowestActivePrice": number,
        "netExpected": number,
        "confidence": number,
        "citations": ["url1", "url2", ...]
      }`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Basic JSON extraction from markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not extract JSON from agent response");
      
      const signal = JSON.parse(jsonMatch[0]);
      const { medianSoldPrice, activeCount, soldCount, netExpected, confidence, citations } = signal;

      if (!dryRun) {
        await sql.query(`
          INSERT INTO part_market_signal (
            part_number, normalized_model, ebay_active_count, ebay_sold_count,
            sell_through_rate, median_sold_price, active_min_price, net_expected, confidence, checked_at, raw
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
          ON CONFLICT (part_number, normalized_model) DO UPDATE SET
            ebay_active_count = EXCLUDED.ebay_active_count,
            ebay_sold_count = EXCLUDED.ebay_sold_count,
            sell_through_rate = EXCLUDED.sell_through_rate,
            median_sold_price = EXCLUDED.median_sold_price,
            active_min_price = EXCLUDED.active_min_price,
            net_expected = EXCLUDED.net_expected,
            confidence = EXCLUDED.confidence,
            checked_at = now(),
            raw = EXCLUDED.raw
        `, [
          part.part_number, 
          part.normalized_model, 
          activeCount || 0, 
          soldCount || 0, 
          (activeCount > 0 ? soldCount / activeCount : 0), 
          medianSoldPrice || 0, 
          signal.lowestActivePrice || 0,
          netExpected || 0, 
          String(confidence || 'low'),
          JSON.stringify({ agent_analysis: responseText, signal, citations, confidence })
        ]);
        console.log(`✅ Agentic Signal updated for ${part.part_number} (Net: $${(netExpected || 0).toFixed(2)}, Conf: ${confidence})`);
      } else {
        console.log(`[DRY RUN] Agent would update signal for ${part.part_number}:`, signal);
      }
      
      await new Promise(r => setTimeout(r, 1000)); // Minimal delay for API rate limits
    } catch (err) {
      console.error(`❌ Failed agentic survey for ${part.part_number}:`, err.message);
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
      b.description as part_name
    FROM part_market_signal s
    JOIN machine_inventory m ON s.normalized_model = m.normalized_model
    JOIN appliance_models am ON m.normalized_model = am.normalized_model
    JOIN bom_parts b ON s.part_number = b.part_number AND b.model_id = am.id
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
