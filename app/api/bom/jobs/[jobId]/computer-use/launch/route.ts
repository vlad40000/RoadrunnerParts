import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getBomJob } from "@/src/features/bom/services/job-store";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

async function writeLaunchTelemetry(input: {
  jobId: string;
  event: string;
  status: string;
  model?: string | null;
  brand?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(bomTelemetry).values({
    jobId: input.jobId,
    event: input.event,
    status: input.status,
    model: input.model ?? null,
    brand: input.brand ?? null,
    payload: input.payload ?? {},
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;
  const job = await getBomJob(jobId);

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "BOM job not found" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const sourceUrl = String(body.sourceUrl || "").trim();
  const appUrl = req.nextUrl.origin;
  const goal = String(body.goal || "").trim() ||
    [
      "Run the RoadrunnerParts computer-use visual evidence loop.",
      `Model: ${job.model || body.model || "UNKNOWN"}`,
      sourceUrl ? `Start URL: ${sourceUrl}` : "",
      "Capture screenshots, proposed actions, redirects, blockers, and source-backed evidence only.",
      "Do not write final BOM rows or speculative cache output.",
    ].filter(Boolean).join("\n");

  const scriptPath = path.join(process.cwd(), "browser-agent", "computer-use-agent.mjs");
  const child = spawn(
    process.execPath,
    [
      scriptPath,
      "--job-id",
      jobId,
      "--app-url",
      appUrl,
      "--url",
      sourceUrl || "https://encompass.com",
      "--model",
      String(job.model || body.model || ""),
      "--goal",
      goal,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: {
        ...process.env,
        ROADRUNNER_APP_URL: appUrl,
        ROADRUNNER_JOB_ID: jobId,
      },
    },
  );

  child.unref();

  await writeLaunchTelemetry({
    jobId,
    event: "cu_agent_launch",
    status: "running",
    model: job.model,
    brand: job.brand,
    payload: {
      pid: child.pid,
      sourceUrl: sourceUrl || null,
      scriptPath,
      appUrl,
      goal,
    },
  });

  return NextResponse.json({
    ok: true,
    jobId,
    pid: child.pid,
  });
}
