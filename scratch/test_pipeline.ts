import { buildBomJob } from "../src/features/bom/core/bom-orchestrator";
import { logger } from "../src/lib/logger";

async function testPipeline() {
  const input = {
    identityFiles: [],
    userHints: { brand: "Whirlpool", model: "W12345" },
    mode: "full" as const,
    jobId: "test_job_123",
    onStage: (stage: string) => {
      console.log(`[STAGE] ${stage}`);
    },
    onPartialResult: (output: any) => {
      console.log(`[PARTIAL] Identity Found: ${output.identity?.model}`);
    }
  };

  try {
    const output = await buildBomJob(input as any);
    console.log("Pipeline output successful");
    console.log("Final unique count:", output.result.uniqueRowCount);
  } catch (err) {
    console.error("Pipeline failed:", err);
  }
}

// Note: This requires environment variables and actual model calls to run fully.
// This script is for architectural verification and manual execution if needed.
console.log("Pipeline test script ready.");
