import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
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

const limit = Number(args.get("limit") || 50);
const dryRun = args.get("dry-run") === "true";
const minNetExpected = parseFloat(args.get("min-net") || "15.00");

async function loadMarketableParts() {
  // Find parts with high net_expected and existing machine evidence
  const rows = await sql.query(`
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
    LIMIT $2
  `, [minNetExpected, limit]);
  return rows;
}

async function prepareListing(row) {
  console.log(`Preparing listing for ${row.part_number} (Net: $${row.net_expected})`);
  
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
  
  const price = row.median_sold_price;
  
  if (dryRun) {
    console.log(`[DRY RUN] Title: ${title}`);
    console.log(`[DRY RUN] Price: ${price}`);
    return;
  }
  
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
    price, 
    "draft", 
    JSON.stringify({ description, generated_at: new Date().toISOString() })
  ]);
  
  console.log(`Created draft listing for ${row.part_number}`);
}

async function main() {
  const rows = await loadMarketableParts();
  console.log(`Found ${rows.length} marketable parts.`);
  
  for (const row of rows) {
    await prepareListing(row);
  }
  
  console.log("Done.");
}

main().catch(console.error);
