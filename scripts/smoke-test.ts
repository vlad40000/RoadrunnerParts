import "./setup-env";
import { discoverDiagramGroupsForJob, extractAllDiagramGroupsForJob } from "../src/features/bom/core/grouped-bom";
import { SMOKE_TEST_CASES } from "./smoke-test.cases";
import { createBomJob, getBomJob } from "../src/features/bom/services/job-store";
import { enrichBomRowsWithRetailPricing } from "../src/features/bom/services/retail-pricing";

async function runSmokeTest() {
  console.log("🚀 Starting Smoke Test Validation...\n");

  for (const testCase of SMOKE_TEST_CASES) {
    console.log(`--- [${testCase.label}] Model: ${testCase.model} ---`);
    
    try {
      // 1. Create Job
      const initialJob = await createBomJob();
      if (!initialJob) throw new Error("Failed to create job");
      const jobId = initialJob.id;

      // 2. Discover Groups
      console.log("Discovering groups...");
      const discovery = await discoverDiagramGroupsForJob({
        jobId,
        identity: {
          brand: testCase.brand,
          model: testCase.model,
          confidence: 1.0,
        }
      });

      console.log(`Found ${discovery.groups.length} groups. Truth Source: ${discovery.job?.truthSource}`);
      
      // Verify expectedPartsTotal for Fix.com
      if (discovery.job?.truthSource === "fix.com" || discovery.job?.truthSource === "searspartsdirect.com") {
         if (discovery.job?.expectedPartsTotal) {
           console.log(`✅ Expected Parts Total Captured: ${discovery.job.expectedPartsTotal}`);
         } else {
           console.log(`⚠️ Expected Parts Total MISSING for ${discovery.job?.truthSource}`);
         }
      }

      // 3. Extract All Groups
      console.log("Extracting all groups...");
      const extraction = await extractAllDiagramGroupsForJob({ jobId });
      const finalJob = await getBomJob(jobId);

      if (!finalJob) throw new Error("Job missing after extraction");

      console.log(`Result Status: ${finalJob.resultStatus}`);
      console.log(`Unique Rows: ${finalJob.uniqueRowCount}`);
      console.log(`Coverage: ${(Number(finalJob.coveragePct || 0) * 100).toFixed(1)}%`);

      // Verify Honest State
      const validStatuses = ["bom_complete", "bom_near_complete", "parts_partial", "needs_fallback", "no_result", "summary_only", "db_complete", "cache_hit"];
      if (validStatuses.includes(finalJob.resultStatus || "")) {
        console.log(`✅ Honest State Verified: ${finalJob.resultStatus}`);
      } else {
        console.log(`❌ Invalid Result Status: ${finalJob.resultStatus}`);
      }

      // Verify zero-row results never write complete cache
      if (finalJob.uniqueRowCount === 0 && (finalJob.resultStatus === "bom_complete" || finalJob.resultStatus === "bom_near_complete")) {
        console.log("❌ CRITICAL: Zero-row result reported as complete!");
      } else if (finalJob.uniqueRowCount === 0) {
        console.log("✅ Zero-row result correctly reported as non-complete.");
      }

      // 4. Pricing Enrichment
      console.log("Enriching with pricing...");
      const rowCountBefore = finalJob.finalRows?.length || 0;
      const pricing = await enrichBomRowsWithRetailPricing({
        brand: finalJob.brand,
        model: finalJob.model,
        rows: finalJob.finalRows as any[],
        maxTargetedLookups: 5,
      });

      const rowCountAfter = pricing.rows.length;
      if (rowCountBefore === rowCountAfter) {
        console.log(`✅ Pricing Enrichment: Row count maintained (${rowCountBefore})`);
      } else {
        console.log(`❌ Pricing Enrichment: Row count CHANGED from ${rowCountBefore} to ${rowCountAfter}!`);
      }

      console.log(`Priced Rows: ${pricing.pricedRowCount}\n`);

    } catch (error) {
      console.error(`❌ Smoke test failed for ${testCase.label}:`, error instanceof Error ? error.message : String(error));
    }
  }

  // 5. Verify no_result for fake model
  console.log("--- [Fake Model] Model: FAKE-123 ---");
  try {
    const job = await createBomJob();
    if (!job) throw new Error("Failed to create job");
    try {
      await discoverDiagramGroupsForJob({
        jobId: job.id,
        identity: { model: "FAKE-MODEL-ABC-XYZ", confidence: 1.0 }
      });
      console.log("❌ Error: Fake model should have failed discovery.");
    } catch (err) {
      console.log(`✅ Discovery correctly failed for fake model: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (error) {
    console.error("Failed to run fake model test");
  }

  console.log("\n🏁 Smoke Test Validation Complete.");
}

runSmokeTest().catch(console.error);
