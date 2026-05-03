import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, or, isNull, lt, sql as drizzleSql } from "drizzle-orm";
import { bomJobs } from "../../server/db/schema/bom-jobs";
import { runRetrievalEngine } from "./retrieval-engine";
import crypto from "crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");

const sql = neon(databaseUrl);
const db = drizzle(sql);

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;
const POLLING_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

console.log(`[Worker ${WORKER_ID}] Starting BOM Retrieval Worker...`);

async function heartbeat() {
  try {
    // Update heartbeat for jobs this worker is currently processing
    await db
      .update(bomJobs)
      .set({ lastHeartbeat: new Date() })
      .where(eq(bomJobs.workerId, WORKER_ID));
  } catch (err) {
    console.error(`[Worker ${WORKER_ID}] Heartbeat failed:`, err);
  }
}

async function poll() {
  try {
    // 1. Find a pending job
    // Also look for "stale" jobs (worker died)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    const [job] = await db
      .select()
      .from(bomJobs)
      .where(
        or(
          eq(bomJobs.jobStage, "retrieval_pending"),
          and(
            eq(bomJobs.jobStage, "retrieval_active"),
            lt(bomJobs.lastHeartbeat, staleThreshold)
          )
        )
      )
      .limit(1);

    if (!job) return;

    console.log(`[Worker ${WORKER_ID}] Claiming job ${job.id} for model ${job.model}...`);

    // 2. Claim the job
    await db
      .update(bomJobs)
      .set({
        jobStage: "retrieval_active",
        workerId: WORKER_ID,
        lastHeartbeat: new Date(),
      })
      .where(eq(bomJobs.id, job.id));

    // 3. Process the job
    try {
      await runRetrievalEngine({
        jobId: job.id,
        model: job.model!,
        brand: job.brand,
        db
      });
      
      console.log(`[Worker ${WORKER_ID}] Job ${job.id} complete.`);
    } catch (error) {
      console.error(`[Worker ${WORKER_ID}] Job ${job.id} failed:`, error);
      
      await db
        .update(bomJobs)
        .set({
          jobStage: "failed",
          errorText: error instanceof Error ? error.message : "Unknown worker error",
          updatedAt: new Date(),
        })
        .where(eq(bomJobs.id, job.id));
    }

  } catch (err) {
    console.error(`[Worker ${WORKER_ID}] Polling error:`, err);
  }
}

// Start loops
setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
setInterval(poll, POLLING_INTERVAL_MS);

// Run initial poll immediately
poll();
