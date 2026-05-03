process.env.DATABASE_URL = "postgresql://neondb_owner:npg_ARVw2QokXPn5@ep-wild-mountain-an7msxxw-pooler.c-6.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
process.env.NEON_DATABASE_URL = process.env.DATABASE_URL;
process.env.WORKER_PLAYWRIGHT = "1";

import { enqueueEncompassRetrievalJob } from "../src/features/bom/services/retrieval-job-store";
import { runRetrievalWorker } from "../src/features/bom/services/retrieval-worker";
import { createOrReuseBomJob } from "../src/features/bom/services/job-store";
import { db } from "../src/server/db";
import { bomRetrievalJobs } from "../src/server/db/schema/bom-retrieval-jobs";
import { eq } from "drizzle-orm";

async function testWorker() {
  console.log("--- Testing Worker Flow ---");

  const model = "WTW7500GC2";
  const brand = "Whirlpool";
  
  console.log(`Creating/reusing BOM job for ${model}...`);
  const bomJob = await createOrReuseBomJob({ model, brand });
  if (!bomJob) throw new Error("Failed to create BOM job");
  const bomJobId = bomJob.id;

  // 1. Enqueue (Mocking a BOM Job entry might be needed if foreign key exists, but schema doesn't show one)
  console.log(`Enqueuing job for ${model}...`);
  const job = await enqueueEncompassRetrievalJob({
    bomJobId,
    model,
    brand,
  });

  console.log(`Job enqueued: ${job?.id}`);

  // 2. Run Worker
  console.log("Running worker...");
  const workerResult = await runRetrievalWorker("test-worker-1");
  console.log("Worker finished:", workerResult);

  // 3. Verify Job Status
  if (job) {
    const [updatedJob] = await db
      .select()
      .from(bomRetrievalJobs)
      .where(eq(bomRetrievalJobs.id, job.id));

    console.log("Final Job Status:", {
      id: updatedJob?.id,
      status: updatedJob?.status,
      attempts: updatedJob?.attempts,
      error: updatedJob?.errorText,
      summary: updatedJob?.resultSummary,
    });
  }
}

testWorker().catch(console.error);
