import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import fs from "fs";
import { scrapeEbayActive, scrapeEbaySold } from "../src/lib/ebay-scraper.ts";
import { classifyEbayBrandPriority, ebayBrandPriorityRank } from "../src/lib/ebay-brand-priority.ts";

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
const brandScope = String(args.get("brand-scope") || "all");
const currentScopePath = String(args.get("current-scope") || "scratch/current-ebay-scope.json");
const excludeCurrentScope = args.get("exclude-current-scope") === "true";
const includeFresh = args.get("include-fresh") === "true";
const debugCandidates = args.get("debug-candidates") === "true";

function loadCurrentScopePartNumbers() {
  if (!fs.existsSync(currentScopePath)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(currentScopePath, "utf8"));
  const rows = Array.isArray(parsed.parts) ? parsed.parts : Array.isArray(parsed.listings) ? parsed.listings : [];
  return new Set(rows.map((row) => String(row.partNumber || "").trim().toUpperCase()).filter(Boolean));
}

function listingMatchesExactPart(partNumber, listing) {
  const part = String(partNumber || "").trim().toUpperCase();
  if (!part) return false;
  const text = [
    listing?.title,
    listing?.itemUrl,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  return text.includes(part);
}

function exactPartMatches(partNumber, listings) {
  return listings.filter((listing) => listingMatchesExactPart(partNumber, listing));
}

async function loadPartsToSurvey() {
  const currentScopePartNumbers = loadCurrentScopePartNumbers();
  const candidateLimit = Math.max(limit * 100, 500);
  const rows = await sql.query(`
    WITH candidate_parts AS (
      SELECT
        b.part_number,
        b.normalized_model,
        b.part_name,
        b.source AS part_source
      FROM bom_part b
      WHERE b.normalized_model IS NOT NULL
        AND b.part_number IS NOT NULL
      UNION ALL
      SELECT
        coalesce(
          part ->> 'partNumber',
          part ->> 'currentServicePartNumber',
          part ->> 'current_service_part_number',
          part ->> 'oem_number'
        ) AS part_number,
        c.normalized_model,
        coalesce(part ->> 'description', part ->> 'part_name', 'Appliance Part') AS part_name,
        'model_parts_cache' AS part_source
      FROM model_parts_cache c,
      lateral jsonb_array_elements(c.parts) AS part
      WHERE c.normalized_model IS NOT NULL
        AND coalesce(
          part ->> 'partNumber',
          part ->> 'currentServicePartNumber',
          part ->> 'current_service_part_number',
          part ->> 'oem_number'
        ) IS NOT NULL
    ),
    candidate_machines AS (
      SELECT
        m.id::text AS machine_id,
        m.brand,
        m.brand_family,
        m.resolved_oem_brand,
        m.manufacturer_family,
        m.normalized_model,
        m.appliance_type,
        m.priority_score,
        'machine_inventory' AS machine_source,
        0 AS source_rank
      FROM machine_inventory m
      WHERE m.normalized_model IS NOT NULL
      UNION ALL
      SELECT
        null::text AS machine_id,
        c.brand,
        null::text AS brand_family,
        null::text AS resolved_oem_brand,
        null::text AS manufacturer_family,
        c.normalized_model,
        c.category AS appliance_type,
        null::numeric AS priority_score,
        'model_parts_cache_broad_fallback' AS machine_source,
        1 AS source_rank
      FROM model_parts_cache c
      WHERE c.normalized_model IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM machine_inventory m
          WHERE m.normalized_model = c.normalized_model
        )
    ),
    machine_candidates AS (
      SELECT DISTINCT ON (b.part_number, b.normalized_model)
        b.part_number,
        b.normalized_model,
        b.part_name,
        b.part_source,
        m.machine_id,
        m.brand,
        m.brand_family,
        m.resolved_oem_brand,
        m.manufacturer_family,
        m.appliance_type,
        m.priority_score,
        m.machine_source,
        m.source_rank,
        q.rank_score
      FROM candidate_machines m
      JOIN candidate_parts b
        ON b.normalized_model = m.normalized_model
      LEFT JOIN appliance_inventory_queue q
        ON m.machine_id = q.machine_id
      WHERE m.normalized_model IS NOT NULL
        AND b.part_number IS NOT NULL
      ORDER BY b.part_number, b.normalized_model, m.source_rank, q.rank_score DESC NULLS LAST, m.priority_score DESC NULLS LAST
    )
    SELECT c.*, s.checked_at
    FROM machine_candidates c
    LEFT JOIN part_market_signal s
      ON c.part_number = s.part_number
     AND c.normalized_model = s.normalized_model
    WHERE ($2::boolean = true OR s.checked_at IS NULL OR s.checked_at < now() - interval '7 days')
    LIMIT $1
  `, [candidateLimit, includeFresh]);

  return rows
    .map((row) => {
      const priority = classifyEbayBrandPriority({
        brand: row.brand,
        brandFamily: row.brand_family,
        resolvedOemBrand: row.resolved_oem_brand,
        manufacturerFamily: row.manufacturer_family,
        normalizedModel: row.normalized_model,
      });
      const partNumber = String(row.part_number || "").trim().toUpperCase();
      return {
        ...row,
        part_number: partNumber,
        in_current_41: currentScopePartNumbers.has(partNumber),
        ...priority,
      };
    })
    .filter((row) => {
      if (excludeCurrentScope && row.in_current_41) return false;
      if (brandScope === "bread-and-butter" || brandScope === "bread_and_butter") return row.brandPriority === "bread_and_butter";
      return true;
    })
    .sort((a, b) => {
      return (
        ebayBrandPriorityRank(a.brandPriority) - ebayBrandPriorityRank(b.brandPriority) ||
        Number(a.in_current_41) - Number(b.in_current_41) ||
        Number(a.source_rank || 0) - Number(b.source_rank || 0) ||
        Number(b.rank_score || 0) - Number(a.rank_score || 0) ||
        Number(b.priority_score || 0) - Number(a.priority_score || 0) ||
        String(a.part_number).localeCompare(String(b.part_number))
      );
    })
    .slice(0, limit);
}

async function printCandidateDebug() {
  const [counts] = await sql.query(`
    SELECT
      (SELECT count(*)::int FROM machine_inventory) AS machine_rows,
      (SELECT count(DISTINCT normalized_model)::int FROM machine_inventory WHERE normalized_model IS NOT NULL) AS machine_models,
      (SELECT count(DISTINCT normalized_model)::int FROM bom_part WHERE normalized_model IS NOT NULL) AS bom_part_models,
      (SELECT count(DISTINCT normalized_model)::int FROM model_parts_cache WHERE normalized_model IS NOT NULL) AS cache_models,
      (
        SELECT count(DISTINCT m.normalized_model)::int
        FROM machine_inventory m
        JOIN bom_part b ON b.normalized_model = m.normalized_model
        WHERE m.normalized_model IS NOT NULL
      ) AS bom_part_machine_model_overlap,
      (
        SELECT count(DISTINCT m.normalized_model)::int
        FROM machine_inventory m
        JOIN model_parts_cache c ON c.normalized_model = m.normalized_model
        WHERE m.normalized_model IS NOT NULL
      ) AS cache_machine_model_overlap
  `);
  const machineSample = await sql.query(`
    SELECT id::text AS machine_id, brand, brand_family, resolved_oem_brand, manufacturer_family, normalized_model
    FROM machine_inventory
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 10
  `);
  const cacheSample = await sql.query(`
    SELECT normalized_model, brand, category, jsonb_array_length(parts) AS part_count
    FROM model_parts_cache
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 10
  `);
  const rows = await sql.query(`
    WITH candidate_parts AS (
      SELECT b.part_number, b.normalized_model, b.part_name
      FROM bom_part b
      WHERE b.normalized_model IS NOT NULL
        AND b.part_number IS NOT NULL
      UNION ALL
      SELECT
        coalesce(
          part ->> 'partNumber',
          part ->> 'currentServicePartNumber',
          part ->> 'current_service_part_number',
          part ->> 'oem_number'
        ) AS part_number,
        c.normalized_model,
        coalesce(part ->> 'description', part ->> 'part_name', 'Appliance Part') AS part_name
      FROM model_parts_cache c,
      lateral jsonb_array_elements(c.parts) AS part
      WHERE c.normalized_model IS NOT NULL
        AND coalesce(
          part ->> 'partNumber',
          part ->> 'currentServicePartNumber',
          part ->> 'current_service_part_number',
          part ->> 'oem_number'
        ) IS NOT NULL
    ),
    candidate_machines AS (
      SELECT
        m.id::text AS machine_id,
        m.brand,
        m.brand_family,
        m.resolved_oem_brand,
        m.manufacturer_family,
        m.normalized_model,
        m.appliance_type,
        m.priority_score,
        'machine_inventory' AS machine_source,
        0 AS source_rank
      FROM machine_inventory m
      WHERE m.normalized_model IS NOT NULL
      UNION ALL
      SELECT
        null::text AS machine_id,
        c.brand,
        null::text AS brand_family,
        null::text AS resolved_oem_brand,
        null::text AS manufacturer_family,
        c.normalized_model,
        c.category AS appliance_type,
        null::numeric AS priority_score,
        'model_parts_cache_broad_fallback' AS machine_source,
        1 AS source_rank
      FROM model_parts_cache c
      WHERE c.normalized_model IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM machine_inventory m
          WHERE m.normalized_model = c.normalized_model
        )
    )
    SELECT DISTINCT ON (p.part_number, p.normalized_model)
      p.part_number,
      p.normalized_model,
      p.part_name,
      m.machine_id,
      m.brand,
      m.brand_family,
      m.resolved_oem_brand,
      m.manufacturer_family,
      m.appliance_type,
      m.priority_score,
      m.machine_source,
      m.source_rank
    FROM candidate_machines m
    JOIN candidate_parts p
      ON p.normalized_model = m.normalized_model
    WHERE m.normalized_model IS NOT NULL
      AND p.part_number IS NOT NULL
    ORDER BY p.part_number, p.normalized_model, m.source_rank, m.priority_score DESC NULLS LAST
    LIMIT 5000
  `);

  const classified = rows.map((row) => ({
    ...row,
    ...classifyEbayBrandPriority({
      brand: row.brand,
      brandFamily: row.brand_family,
      resolvedOemBrand: row.resolved_oem_brand,
      manufacturerFamily: row.manufacturer_family,
      normalizedModel: row.normalized_model,
    }),
  }));
  const byPriority = classified.reduce((acc, row) => {
    acc[row.brandPriority] = (acc[row.brandPriority] || 0) + 1;
    return acc;
  }, {});
  const byFamily = classified.reduce((acc, row) => {
    acc[row.normalizedBrandFamily] = (acc[row.normalizedBrandFamily] || 0) + 1;
    return acc;
  }, {});
  const sample = classified.slice(0, 10).map((row) => ({
    partNumber: row.part_number,
    normalizedModel: row.normalized_model,
    brand: row.brand,
    brandFamily: row.brand_family,
    resolvedOemBrand: row.resolved_oem_brand,
    manufacturerFamily: row.manufacturer_family,
    brandPriority: row.brandPriority,
    normalizedBrandFamily: row.normalizedBrandFamily,
    machineSource: row.machine_source,
  }));

  console.log(JSON.stringify({
    counts,
    machineSample,
    cacheSample,
    joinedCandidateRows: classified.length,
    byPriority,
    byFamily,
    sample,
  }, null, 2));
}

async function processPart(row) {
  console.log(`Surveying eBay for part: ${row.part_number} (${row.part_name}) [${row.brandPriority}${row.in_current_41 ? ", current-41" : ", overlooked-candidate"}]`);
  
  try {
    const activeRaw = await scrapeEbayActive(row.part_number);
    const soldRaw = await scrapeEbaySold(row.part_number);
    const active = exactPartMatches(row.part_number, activeRaw);
    const sold = exactPartMatches(row.part_number, soldRaw);
    const warnings = [];
    if (activeRaw.length && !active.length) warnings.push("Active listings were found but none carried exact part-number evidence.");
    if (soldRaw.length && !sold.length) warnings.push("Sold listings were found but none carried exact part-number evidence.");
    
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
    const confidence = soldCount >= 5 ? "high" : soldCount >= 2 ? "medium" : soldCount >= 1 ? "low" : "none";
    const raw = {
      active_listings: active,
      sold_listings: sold,
      rejected_active_listings: activeRaw.length - active.length,
      rejected_sold_listings: soldRaw.length - sold.length,
      brandPriority: row.brandPriority,
      normalizedBrandFamily: row.normalizedBrandFamily,
      priorityReason: row.priorityReason,
      partName: row.part_name,
      partSource: row.part_source,
      inCurrent41: row.in_current_41,
      sourceMachine: {
        machineId: row.machine_id,
        brand: row.brand,
        brandFamily: row.brand_family,
        resolvedOemBrand: row.resolved_oem_brand,
        manufacturerFamily: row.manufacturer_family,
        normalizedModel: row.normalized_model,
        applianceType: row.appliance_type,
        rankScore: row.rank_score,
        priorityScore: row.priority_score,
        machineSource: row.machine_source,
      },
      warnings,
    };
    
    if (dryRun) {
      console.log(`[DRY RUN] ${row.part_number}: Active=${activeCount}, Sold=${soldCount}, NetExpected=${netExpected.toFixed(2)}, Confidence=${confidence}`);
      return;
    }
    
    await sql.query(`
      INSERT INTO part_market_signal (
        part_number, normalized_model, ebay_active_count, ebay_sold_count,
        sell_through_rate, median_sold_price, net_expected, confidence, warnings, checked_at, raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
      ON CONFLICT (part_number, normalized_model) DO UPDATE SET
        ebay_active_count = EXCLUDED.ebay_active_count,
        ebay_sold_count = EXCLUDED.ebay_sold_count,
        sell_through_rate = EXCLUDED.sell_through_rate,
        median_sold_price = EXCLUDED.median_sold_price,
        net_expected = EXCLUDED.net_expected,
        confidence = EXCLUDED.confidence,
        warnings = EXCLUDED.warnings,
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
      confidence,
      warnings,
      JSON.stringify(raw)
    ]);
    
    console.log(`Updated signal for ${row.part_number}`);
  } catch (err) {
    console.error(`Failed to survey ${row.part_number}: ${err.message}`);
  }
}

async function main() {
  if (debugCandidates) {
    await printCandidateDebug();
    return;
  }

  const rows = await loadPartsToSurvey();
  console.log(`Found ${rows.length} machine-DB parts to survey. brandScope=${brandScope}, excludeCurrentScope=${excludeCurrentScope}, includeFresh=${includeFresh}`);
  
  for (const row of rows) {
    await processPart(row);
    // Sleep a bit to avoid getting blocked
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("Done.");
}

main().catch(console.error);
