import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type Row = Record<string, any>;

type SelectedSection = {
  sectionId?: string;
  sectionName?: string;
  provider?: string;
  sectionUrl?: string;
  diagramUrl?: string;
  imageUrl?: string;
  expectedPartCount?: number | null;
};

function normalizeModel(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function asInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

async function safeRows<T extends Row>(label: string, errors: Record<string, string>, fn: () => Promise<unknown>) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch (error) {
    errors[label] = error instanceof Error ? error.message : String(error);
    return [] as T[];
  }
}

async function ensureModel(normalizedModel: string, rawModel: string, errors: Record<string, string>) {
  const rows = await safeRows<Row>("ensure_model", errors, () => sql`
    insert into appliance_models (normalized_model, raw_model, retrieval_state, updated_at)
    values (${normalizedModel}, ${rawModel || normalizedModel}, 'sections_locked', now())
    on conflict (normalized_model) do update set
      raw_model = coalesce(appliance_models.raw_model, excluded.raw_model),
      retrieval_state = case
        when appliance_models.retrieval_state in ('bom_complete', 'pricing_complete') then appliance_models.retrieval_state
        else 'sections_locked'
      end,
      updated_at = now()
    returning id::text, normalized_model, raw_model
  `);
  return rows[0] || null;
}

export async function POST(request: Request) {
  const errors: Record<string, string> = {};
  const body = await request.json().catch(() => ({}));
  const rawModel = String(body.model || "").trim();
  const normalizedModel = normalizeModel(rawModel);
  const selectedSections = Array.isArray(body.sections) ? (body.sections as SelectedSection[]) : [];
  const reviewer = cleanText(body.reviewer) || "human";

  if (!normalizedModel) {
    return NextResponse.json({ ok: false, error: "Model is required." }, { status: 400 });
  }

  if (!selectedSections.length) {
    return NextResponse.json({ ok: false, error: "At least one section must be selected." }, { status: 400 });
  }

  const modelRow = await ensureModel(normalizedModel, rawModel, errors);
  if (!modelRow?.id) {
    return NextResponse.json({ ok: false, error: "Could not resolve model row.", errors }, { status: 500 });
  }

  const lockedSections: any[] = [];
  const queuedJobs: any[] = [];

  for (let index = 0; index < selectedSections.length; index += 1) {
    const section = selectedSections[index];
    const sectionName = cleanText(section.sectionName) || `Selected Section ${index + 1}`;
    const provider = cleanText(section.provider) || "hitl";
    const sectionUrl = cleanText(section.sectionUrl);
    const diagramUrl = cleanText(section.diagramUrl);
    const imageUrl = cleanText(section.imageUrl);
    const expectedPartCount = asInt(section.expectedPartCount);

    const assemblyRows = await safeRows<Row>(`upsert_section_${index}`, errors, () => sql`
      insert into bom_assemblies (
        model_id,
        source,
        assembly_name,
        assembly_url,
        diagram_url,
        position,
        created_at
      ) values (
        ${modelRow.id}::uuid,
        ${provider},
        ${sectionName},
        ${sectionUrl},
        ${diagramUrl || imageUrl},
        ${index + 1},
        now()
      )
      on conflict (model_id, source, assembly_name) do update set
        assembly_url = coalesce(excluded.assembly_url, bom_assemblies.assembly_url),
        diagram_url = coalesce(excluded.diagram_url, bom_assemblies.diagram_url),
        position = coalesce(excluded.position, bom_assemblies.position)
      returning id::text, source, assembly_name, assembly_url, diagram_url, position
    `);

    const assembly = assemblyRows[0];
    lockedSections.push({
      ...assembly,
      expectedPartCount,
      selectedBy: reviewer,
      sectionUrl,
      diagramUrl,
      imageUrl,
    });

    const jobRows = await safeRows<Row>(`queue_section_${index}`, errors, () => sql`
      insert into retrieval_jobs (
        model_id,
        model_number,
        source,
        job_type,
        status,
        priority,
        metadata,
        created_at,
        updated_at
      ) values (
        ${modelRow.id}::uuid,
        ${normalizedModel},
        ${provider},
        'selected_section_extract',
        'queued',
        10,
        ${JSON.stringify({
          sectionId: assembly?.id || section.sectionId || null,
          sectionName,
          sectionUrl,
          diagramUrl,
          imageUrl,
          expectedPartCount,
          selectedBy: reviewer,
          extractionMode: 'hybrid',
          source: 'hitl_section_selection_api',
        })}::jsonb,
        now(),
        now()
      )
      returning id::text, job_type, status, source, metadata
    `);

    if (jobRows[0]) queuedJobs.push(jobRows[0]);
  }

  const expectedTotal = selectedSections
    .map((section) => asInt(section.expectedPartCount))
    .filter((value): value is number => typeof value === "number")
    .reduce((sum, value) => sum + value, 0);

  await safeRows<Row>("update_model_summary", errors, () => sql`
    insert into model_retrieval_summary (
      model_id,
      retrieval_state,
      expected_part_count,
      assembly_count,
      updated_at
    ) values (
      ${modelRow.id}::uuid,
      'sections_locked',
      ${expectedTotal > 0 ? expectedTotal : null},
      ${lockedSections.length},
      now()
    )
    on conflict (model_id) do update set
      retrieval_state = 'sections_locked',
      expected_part_count = coalesce(excluded.expected_part_count, model_retrieval_summary.expected_part_count),
      assembly_count = excluded.assembly_count,
      updated_at = now()
    returning model_id::text
  `);

  return NextResponse.json({
    ok: true,
    model: normalizedModel,
    retrievalState: "selected_sections_queued",
    lockedSections,
    queuedJobs,
    errors,
  });
}
