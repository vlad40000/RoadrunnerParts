import "server-only";
import { db } from "@/server/db";
import { bomTelemetry } from "@/server/db/schema/bom-telemetry";

export async function logTelemetry(input: {
  jobId?: string;
  event: string;
  status: "success" | "failed";
  model?: string;
  brand?: string;
  payload?: Record<string, unknown>;
  systemPrompt?: string;
}) {
  try {
    await db.insert(bomTelemetry).values({
      jobId: input.jobId ?? null,
      event: input.event,
      status: input.status,
      model: input.model ?? null,
      brand: input.brand ?? null,
      payload: input.payload ?? {},
      systemPrompt: input.systemPrompt ?? null,
    });
  } catch (err) {
    // Fail silently to avoid blocking main execution
    console.warn(`[Telemetry] Failed to log event ${input.event}:`, err);
  }
}
