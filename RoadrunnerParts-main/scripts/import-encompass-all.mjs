import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

function normalizeModel(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const files = process.argv.slice(2).filter(f => !f.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");

  if (!files.length) {
    throw new Error("Pass one or more Encompass JSON files. Use --dry-run for testing.");
  }

  const db = drizzle(neon(databaseUrl));

  if (dryRun) console.log("--- DRY RUN MODE ---");

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const raw = await fs.readFile(path.resolve(file), "utf8");
    const json = JSON.parse(raw);

    let records = [];
    let isCombined = false;

    if (Array.isArray(json)) {
      records = json.map(r => ({ data: r, source_file: path.basename(file) }));
    } else if (json.records && Array.isArray(json.records)) {
      records = json.records;
      isCombined = true;
    } else {
      console.warn(`Skipping ${file}: Unknown format.`);
      continue;
    }

    console.log(`Found ${records.length} records.`);

    // Map to aggregate part counts by model
    const modelPartCounts = new Map();

    for (const record of records) {
      const data = record.data || record;
      
      // Heuristic extraction for messy URL records
      let modelNumber = data.model_number || data.model;
      let url = data.url || data.assembly_url;
      let encompassId = data.encompass_id;
      let brand = data.brand || data.brand_code;

      // Special handling for messy CSV-as-keys records
      if (!modelNumber || !url) {
        for (const [key, val] of Object.entries(data)) {
          if (key.startsWith("https://encompass.com")) url = key;
          if (typeof val === "string" && val.startsWith("https://encompass.com")) url = val;
          if (key.length > 5 && key.length < 20 && /^[A-Z0-9-]+$/.test(key)) modelNumber = key;
          if (typeof val === "string" && val.length > 5 && val.length < 20 && /^[A-Z0-9-]+$/.test(val)) modelNumber = val;
        }
      }

      if (modelNumber && url) {
        const normalized = normalizeModel(modelNumber);
        const urlParts = url.split("/");
        
        // Valid routes we expect from Encompass
        const VALID_ROUTES = ["HOT", "WHI", "MAY", "FRI", "ZEN"];
        
        let route = (brand || urlParts[4] || "WHI").toUpperCase();
        const idFromUrl = encompassId || urlParts[5];

        // Explicit Route Mapping from User Confirmation (as a fallback/hint)
        const ROUTE_MAP = {
          HOT: ["FISHER PAYKEL", "GE", "HAIER", "HOTPOINT", "PRIVATE BRAND", "RCA", "UNASSIGNED"],
          WHI: ["MAYTAG", "WHIRLPOOL", "KITCHENAID", "KITCHEN AID", "JENN-AIR", "JENNAIR", "ROPER"],
          MAY: ["ADMIRAL", "BAUKNECKT", "BRASTEMP", "CONSUL", "ESTATE", "GLADIATOR", "INGLIS", "KIRKLAND", "MAGIC CHEF"],
          FRI: ["ELECTROLUX", "FRIGIDAIRE", "GIBSON", "KELVINATOR", "TAPPAN", "WESTINGHOUSE", "CROSLEY", "IKEA", "VINTEC", "UNIVERSAL"],
          ZEN: ["LG"]
        };

        const brandUpper = String(brand || "").toUpperCase();
        
        // SAFE RULE: If the URL already has a valid route, TRUST IT.
        // Do not assume brand alone determines the route.
        if (VALID_ROUTES.includes(urlParts[4]?.toUpperCase())) {
          route = urlParts[4].toUpperCase();
        } else {
          // Only if route is missing/invalid, try to determine from brand or heuristics
          let targetRoute = null;
          for (const [r, brands] of Object.entries(ROUTE_MAP)) {
            if (brands.some(b => brandUpper.includes(b))) {
              targetRoute = r;
              break;
            }
          }

          if (targetRoute) {
            route = targetRoute;
          } else if (route === "HOT" || !VALID_ROUTES.includes(route)) {
            // Default heuristics for missing/generic brands
            if (normalized.startsWith("W") || normalized.startsWith("M")) {
               route = "WHI";
            } else if (normalized.startsWith("A")) {
               // Amana can be WHI or MAY, default to WHI if unknown
               route = "WHI";
            } else if (normalized.startsWith("E") || normalized.startsWith("F")) {
               route = "FRI";
            } else if (normalized.startsWith("L")) {
               route = "ZEN";
            }
          }
        }

        // Ensure URL reflects the chosen route
        if (route !== urlParts[4] && VALID_ROUTES.includes(route)) {
          console.log(`[ROUTE FIX] Adjusting route for ${normalized} (${brand || 'unknown'}): ${urlParts[4]} -> ${route}`);
          url = url.replace(`/${urlParts[4]}/`, `/${route}/`);
        }

        if (!dryRun) {
          await db.execute(sql`
            INSERT INTO encompass_model_urls (
              brand, encompass_route, encompass_id, model_number, encoded_model_number, normalized_model, url, source_file
            ) VALUES (
              ${brand || null}, ${route}, ${idFromUrl || "unknown"}, ${modelNumber}, ${modelNumber}, ${normalized}, ${url}, ${record.source_file || path.basename(file)}
            ) ON CONFLICT (normalized_model, encompass_route, encompass_id) DO UPDATE SET
              url = EXCLUDED.url,
              encompass_route = EXCLUDED.encompass_route
          `);
        } else if (record.row_index % 500 === 0 || record.row_index === 1) {
          console.log(`[DRY RUN] Would upsert URL for ${normalized}: ${url} (Route: ${route})`);
        }

        // Aggregate part counts if available
        if (data.part_count) {
          const current = modelPartCounts.get(normalized) || 0;
          modelPartCounts.set(normalized, current + parseInt(data.part_count, 10));
        }
      }
    }

    // Update expected counts in cache
    for (const [normalized, total] of modelPartCounts.entries()) {
      if (!dryRun) {
        await db.execute(sql`
          INSERT INTO model_parts_cache (id, normalized_model, expected_parts_total, parts, updated_at)
          VALUES (${normalized}, ${normalized}, ${total}, '[]'::jsonb, now())
          ON CONFLICT (normalized_model) DO UPDATE SET
            expected_parts_total = EXCLUDED.expected_parts_total,
            updated_at = now()
        `);
      } else {
        console.log(`[DRY RUN] Would set expected_parts_total for ${normalized} to ${total}`);
      }
    }
  }

  console.log("Done.");
}

main().catch(console.error);
