CREATE TABLE IF NOT EXISTS "bom_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text,
	"event" text NOT NULL,
	"status" text NOT NULL,
	"model" text,
	"brand" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bom_telemetry_job_id_idx" ON "bom_telemetry" ("job_id");
CREATE INDEX IF NOT EXISTS "bom_telemetry_event_idx" ON "bom_telemetry" ("event");
CREATE INDEX IF NOT EXISTS "bom_telemetry_created_at_idx" ON "bom_telemetry" ("created_at");
