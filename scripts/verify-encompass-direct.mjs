import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const TEST_MODELS = [
  { brand: "Hisense", model: "HRF266N6CSE" },
  { brand: "Danby", model: "DCR032A2BDB" },
];

async function verify() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log("Checking encompass_brand_routes table...");
  try {
    const routes = await sql`SELECT count(*) FROM encompass_brand_routes`;
    console.log(`Table exists. Row count: ${routes[0].count}`);
    
    for (const test of TEST_MODELS) {
      console.log(`\n--- Searching for ${test.brand} route ---`);
      const route = await sql`SELECT * FROM encompass_brand_routes WHERE brand = ${test.brand}`;
      if (route.length > 0) {
        console.log(`Found route: ${JSON.stringify(route[0])}`);
      } else {
        console.log(`No route found for ${test.brand}`);
      }
    }
  } catch (err) {
    console.error("Error checking table:", err.message);
  }

  process.exit(0);
}

verify();
