import "dotenv/config";
import { fetchAuthoritativeSources } from "../src/features/bom/services/source-fetcher";
import { db } from "../src/server/db";
import { bomTelemetry } from "../src/server/db/schema/bom-telemetry";
import { desc, eq } from "drizzle-orm";

const TEST_MODELS = [
  { brand: "Hisense", model: "HRF266N6CSE" },
  { brand: "Danby", model: "DCR032A2BDB" },
  { brand: "Roper", model: "RTW4516FW" }, // Whirlpool alias
];

async function verify() {
  console.log("Starting Encompass Hardening Verification...");
  const jobId = `verify_${Date.now()}`;

  for (const test of TEST_MODELS) {
    console.log(`\n--- Testing ${test.brand} ${test.model} ---`);
    try {
      const sources = await fetchAuthoritativeSources({
        jobId,
        brand: test.brand,
        model: test.model
      });

      const encompassSources = sources.filter(s => s.provider.includes("encompass"));
      console.log(`Found ${encompassSources.length} Encompass sources.`);
      
      for (const src of encompassSources) {
        console.log(` - ${src.sourceUrl} (${src.sectionName})`);
      }

      // Check telemetry for any blocks
      const logs = await db
        .select()
        .from(bomTelemetry)
        .where(eq(bomTelemetry.jobId, jobId))
        .orderBy(desc(bomTelemetry.createdAt));

      const blocks = logs.filter(l => l.event.includes("blocked"));
      if (blocks.length > 0) {
        console.warn(`[WARNING] Detected ${blocks.length} blocked requests in telemetry.`);
        blocks.forEach(b => console.log(`  - Blocked: ${b.payload.url} (Status: ${b.payload.status})`));
      } else {
        console.log("[SUCCESS] No blocked requests recorded in telemetry for this model.");
      }

    } catch (err) {
      console.error(`[ERROR] Failed to fetch sources for ${test.model}:`, err.message);
    }
  }

  process.exit(0);
}

verify();
