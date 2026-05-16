import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type Row = Record<string, any>;

function normalizeModel(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
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
    values (${normalizedModel}, ${rawModel || normalizedModel}, 'hitl_review_required', now())
    on conflict (normalized_model) do update set
      raw_model = coalesce(appliance_models.raw_model, excluded.raw_model),
      retrieval_state = case
        when appliance_models.retrieval_state in ('bom_complete', 'pricing_complete') then appliance_models.retrieval_state
        else 'hitl_review_required'
      end,
      updated_at = now()
    returning id::text, normalized_model, raw_model, brand, appliance_type, retrieval_state
  `);
  return rows[0] || null;
}

export async function GET(request: Request) {
  const errors: Record<string, string> = {};
  const { searchParams } = new URL(request.url);
  const rawModel = String(searchParams.get("model") || "").trim();
  const normalizedModel = normalizeModel(rawModel);

  if (!normalizedModel) {
    return NextResponse.json({ ok: false, error: "Model parameter is required." }, { status: 400 });
  }

  const modelRow = await ensureModel(normalizedModel, rawModel, errors);
  if (!modelRow?.id) {
    return NextResponse.json({ ok: false, error: "Could not resolve model row.", errors }, { status: 500 });
  }

  const [sources, sections, jobs, counts] = await Promise.all([
    safeRows<Row>("provider_model_routes", errors, () => sql`
      select
        provider,
        provider_model_url,
        provider_option_value,
        source_status,
        source_file,
        source_row,
        created_at,
        updated_at
      from provider_model_routes
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by updated_at desc nulls last, created_at desc nulls last
      limit 100
    `),
    safeRows<Row>("provider_assembly_sections", errors, () => sql`
      select
        id::text,
        provider,
        provider_option_value,
        provider_assembly_url,
        diagram_url,
        image_url,
        section_seq,
        section_label_raw,
        section_name_clean,
        normalized_section,
        section_family,
        source_status,
        source_file,
        source_row,
        created_at
      from provider_assembly_sections
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by section_seq nulls last, section_name_clean nulls last, created_at asc
      limit 500
    `),
    safeRows<Row>("retrieval_jobs", errors, () => sql`
      select id::text, job_type, source, status, priority, metadata, created_at, updated_at
      from retrieval_jobs
      where model_number = ${normalizedModel}
        and job_type in ('hitl_review', 'selected_section_extract', 'pricing_lookup')
      order by created_at desc
      limit 100
    `),
    safeRows<Row>("counts", errors, () => sql`
      select
        (select count(*)::int from provider_part_seed_rows where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}) as provider_part_seed_rows,
        (select count(*)::int from bom_parts where model_id = ${modelRow.id}::uuid) as bom_parts,
        (select count(*)::int from part_pricing where model_id = ${modelRow.id}::uuid and price is not null and price > 0) as priced_parts
    `),
  ]);

  const candidateSources = sources.map((row, index) => ({
    id: `source-${index + 1}`,
    provider: row.provider,
    modelUrl: row.provider_model_url,
    optionValue: row.provider_option_value,
    sourceStatus: row.source_status,
    sourceFile: row.source_file,
    sourceRow: row.source_row,
    confidence: row.provider_model_url ? 0.75 : 0.35,
  }));

  const candidateSections = sections.map((row) => ({
    id: row.id,
    sectionId: row.id,
    provider: row.provider,
    optionValue: row.provider_option_value,
    sectionName: cleanText(row.section_name_clean || row.section_label_raw || row.normalized_section) || "Assembly Section",
    sectionSequence: row.section_seq,
    sectionUrl: row.provider_assembly_url,
    diagramUrl: row.diagram_url,
    imageUrl: row.image_url,
    sectionFamily: row.section_family,
    sourceStatus: row.source_status,
    sourceFile: row.source_file,
    sourceRow: row.source_row,
    confidence: row.provider_assembly_url || row.diagram_url ? 0.8 : 0.45,
    requiresHitl: true,
  }));

  const packet = {
    packetId: `hitl-${normalizedModel}`,
    identity: {
      modelNumber: rawModel || normalizedModel,
      normalizedModel,
      manufacturer: modelRow.brand || null,
      applianceType: modelRow.appliance_type || null,
      serialScopeStatus: "unknown",
      confidence: candidateSources.length || candidateSections.length ? 0.65 : 0.25,
    },
    retrievalState: "hitl_review_required",
    candidateSources,
    candidateSections,
    existingCounts: counts[0] || {},
    jobs,
    failureReason: candidateSections.length ? null : "NO_APPROVED_SECTION_MANIFEST",
    recommendedAction: candidateSections.length
      ? "Review candidate assembly sections, select the correct ones, then queue selected section extraction."
      : "Enter a provider model URL or run Playwright discovery to find assembly diagram sections.",
    errors,
  };

  await safeRows<Row>("queue_hitl_review_job", errors, () => sql`
    insert into retrieval_jobs (model_id, model_number, source, job_type, status, priority, metadata, created_at, updated_at)
    values (
      ${modelRow.id}::uuid,
      ${normalizedModel},
      'hitl',
      'hitl_review',
      'queued',
      5,
      ${JSON.stringify(packet)}::jsonb,
      now(),
      now()
    )
    on conflict do nothing
    returning id::text
  `);

  return NextResponse.json({ ok: true, packet });
}

export async function POST(request: Request) {
  const errors: Record<string, string> = {};
  const body = await request.json().catch(() => ({}));
  const rawModel = String(body.model || "").trim();
  const normalizedModel = normalizeModel(rawModel);

  if (!normalizedModel) {
    return NextResponse.json({ ok: false, error: "Model is required." }, { status: 400 });
  }

  const modelRow = await ensureModel(normalizedModel, rawModel, errors);
  if (!modelRow?.id) {
    return NextResponse.json({ ok: false, error: "Could not resolve model row.", errors }, { status: 500 });
  }

  const providerModelUrl = cleanText(body.providerModelUrl);
  const source = cleanText(body.source) || "hitl";

  if (providerModelUrl) {
    await safeRows<Row>("insert_manual_source_url", errors, () => sql`
      insert into provider_model_routes (
        model,
        provider,
        provider_model_url,
        source_status,
        source_file,
        updated_at
      ) values (
        ${normalizedModel},
        ${source},
        ${providerModelUrl},
        'hitl_entered',
        'hitl_review_api',
        now()
      )
      on conflict do nothing
      returning id::text
    `);
  }

  await safeRows<Row>("queue_playwright_discovery", errors, () => sql`
    insert into retrieval_jobs (model_id, model_number, source, job_type, status, priority, metadata, created_at, updated_at)
    values (
      ${modelRow.id}::uuid,
      ${normalizedModel},
      ${source},
      'playwright_diagram_discovery',
      'queued',
      10,
      ${JSON.stringify({ providerModelUrl, requestedBy: 'hitl_review_api' })}::jsonb,
      now(),
      now()
    )
    returning id::text
  `);

  return NextResponse.json({
    ok: true,
    model: normalizedModel,
    queued: true,
    errors,
  });
}
