import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";
import { getBomJob } from "@/src/features/bom/services/job-store";
import { buildKnownEncompassAssemblyUrl } from "@/src/features/bom/services/source-tier-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Max time the Playwright run is allowed before we time out the HTTP response.
// The supervisor call itself continues; the timeout only affects this response.
const LAUNCH_TIMEOUT_MS = 120_000;

type Params = {
  params: Promise<{ jobId: string }>;
};

async function writeTelemetry(
  jobId: string,
  model: string | null,
  brand: string | null,
  event: string,
  status: string,
  payload: Record<string, unknown>,
) {
  await db.insert(bomTelemetry).values({
    jobId,
    event,
    status,
    model: model ?? undefined,
    brand: brand ?? undefined,
    payload,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json({ ok: false, error: "BOM job not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const sourceUrl: string =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim()
      : buildKnownEncompassAssemblyUrl(job.model ?? "") ?? "";

  const model = job.model ?? null;
  const brand = job.brand ?? null;

  // Write launch event so the telemetry feed shows the agent is queued.
  await writeTelemetry(jobId, model, brand, "agent_launch", "running", {
    sourceUrl,
    launchedAt: new Date().toISOString(),
    launchedBy: "operator_dashboard",
  });

  // Fire supervisor in a race against the timeout so the HTTP response isn't
  // held open forever on slow Playwright runs.
  const supervisorPromise: Promise<Record<string, unknown>> = (async () => {
    // Dynamic import avoids bundler issues with Playwright in the edge-adjacent build.
    const { runEncompassSupervisor } = await import("@/browser-agent/encompass-supervisor.mjs") as {
      runEncompassSupervisor: (opts: { model?: string; url?: string; headless: boolean }) => Promise<Record<string, unknown>>;
    };

    return runEncompassSupervisor({
      model: model ?? undefined,
      url: sourceUrl || undefined,
      headless: true,
    });
  })();

  const timeoutPromise: Promise<null> = new Promise((resolve) =>
    setTimeout(() => resolve(null), LAUNCH_TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([supervisorPromise, timeoutPromise]);

    if (result === null) {
      // Timed out — agent may still be running; tell the client to keep polling.
      await writeTelemetry(jobId, model, brand, "agent_timeout", "running", {
        sourceUrl,
        note: "Supervisor timed out waiting for response. Agent may still be executing. Keep polling telemetry.",
        timedOutAt: new Date().toISOString(),
      });

      return NextResponse.json({
        ok: true,
        status: "running",
        message: "Agent launched. Supervisor is still running — continue polling telemetry for updates.",
        jobId,
      });
    }

    // Success — write result as a telemetry event so the feed shows the outcome.
    const screenshot =
      typeof result.screenshotBase64 === "string" ? result.screenshotBase64 :
      typeof result.base64 === "string" ? result.base64 : undefined;

    await writeTelemetry(jobId, model, brand, "cu_screenshot", "complete", {
      sourceUrl,
      screenshot,
      canonUrl: result.canonUrl ?? sourceUrl,
      expectedTotal: result.expectedTotal ?? null,
      assemblyNames: result.assemblyNames ?? [],
      completedAt: new Date().toISOString(),
      rawResult: result,
    });

    return NextResponse.json({
      ok: true,
      status: "complete",
      jobId,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supervisor run failed";

    await writeTelemetry(jobId, model, brand, "agent_error", "failed", {
      sourceUrl,
      error: message,
      failedAt: new Date().toISOString(),
    }).catch(() => undefined);

    return NextResponse.json(
      { ok: false, status: "error", error: message, jobId },
      { status: 500 },
    );
  }
}
