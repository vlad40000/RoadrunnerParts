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

function absoluteEncompassUrl(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://encompass.com${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function buildEncompassSearchUrl(row: Row, normalizedModel: string) {
  const route = cleanText(row.encompass_route || row.encompassRoute);
  if (!route) return null;
  const brand = encodeURIComponent(cleanText(row.brand) || route);
  return `https://encompass.com/Exploded-View-Search/${String(route).toUpperCase()}/${brand}?searchTerm=${encodeURIComponent(normalizedModel)}`;
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

  const [sources, encompassOptions, sections, jobs, counts] = await Promise.all([
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
    safeRows<Row>("encompass_model_urls", errors, () => sql`
      select
        brand,
        encompass_route,
        encompass_id,
        model_number,
        encoded_model_number,
        normalized_model,
        url,
        source_file,
        created_at
      from encompass_model_urls
      where normalized_model = ${normalizedModel}
         or upper(regexp_replace(coalesce(model_number, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
         or upper(regexp_replace(coalesce(encoded_model_number, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by encompass_route asc, encompass_id asc, created_at desc
      limit 50
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
        and job_type in ('hitl_review', 'selected_section_extract', 'pricing_lookup', 'playwright_diagram_discovery')
      order by created_at desc
      limit 100
    `),
    safeRows<Row>("counts", errors, () => sql`
      select
        (select count(*)::int from provider_part_seed_rows where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}) as provider_part_seed_rows,
        (select count(*)::int from bom_parts where model_id = ${modelRow.id}::uuid) as bom_parts,
        (select count(*)::int from part_pricing where model_id = ${modelRow.id}::uuid and price is not null and price > 0) as priced_parts,
        (select count(*)::int from encompass_model_urls where normalized_model = ${normalizedModel}) as encompass_exploded_view_options
    `),
  ]);

  // Bridge Encompass indexed exploded-view rows into provider_model_routes so HITL and
  // downstream deterministic workers see Encompass as a first-class provider option.
  for (const row of encompassOptions) {
    const modelUrl = absoluteEncompassUrl(row.url);
    const route = cleanText(row.encompass_route);
    const optionValue = cleanText(row.encompass_id) || route || modelUrl;
    if (!modelUrl) continue;

    await safeRows<Row>("promote_encompass_model_url", errors, () => sql`
      insert into provider_model_routes (
        brand,
        model,
        provider,
        provider_model_url,
        provider_option_value,
        source_status,
        source_file,
        updated_at
      ) values (
        ${cleanText(row.brand)},
        ${normalizedModel},
        'encompass',
        ${modelUrl},
        ${optionValue},
        'encompass_index_seeded',
        ${cleanText(row.source_file) || 'encompass_model_urls'},
        now()
      )
      on conflict do nothing
      returning id::text
    `);
  }

  const providerCandidateSources = sources.map((row, index) => ({
    id: `source-${index + 1}`,
    provider: row.provider,
    modelUrl: row.provider_model_url,
    optionValue: row.provider_option_value,
    sourceStatus: row.source_status,
    sourceFile: row.source_file,
    sourceRow: row.source_row,
    confidence: row.provider_model_url ? 0.75 : 0.35,
  }));

  const encompassExplodedViewOptions = encompassOptions.map((row, index) => {
    const modelUrl = absoluteEncompassUrl(row.url);
    const routeSearchUrl = buildEncompassSearchUrl(row, normalizedModel);
    return {
      id: `encompass-option-${index + 1}`,
      provider: "encompass",
      brand: row.brand,
      modelUrl,
      explodedViewSearchUrl: routeSearchUrl,
      optionValue: cleanText(row.encompass_id) || cleanText(row.encompass_route),
      encompassRoute: row.encompass_route,
      encompassId: row.encompass_id,
      modelNumber: row.model_number,
      encodedModelNumber: row.encoded_model_number,
      sourceStatus: "encompass_index_seeded",
      sourceFile: row.source_file || "encompass_model_urls",
      confidence: modelUrl ? 0.88 : 0.55,
      nextAction: "request_playwright_capture_or_select_as_provider_source",
    };
  });

  const candidateSources = [...providerCandidateSources, ...encompassExplodedViewOptions];

  const providerCandidateSections = sections.map((row) => ({
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

  // These are not final assembly sections yet; they are Encompass exploded-view
  // provider options that should be visible to HITL so a human can choose them
  // and trigger Playwright/BeautifulSoup discovery against the locked URL.
  const encompassOptionSections = encompassExplodedViewOptions.map((option, index) => ({
    id: `encompass-option-section-${index + 1}`,
    sectionId: `encompass-option-section-${index + 1}`,
    provider: "encompass",
    optionValue: option.optionValue,
    sectionName: `Encompass exploded view option${option.encompassRoute ? ` — ${option.encompassRoute}` : ""}${option.encompassId ? ` / ${option.encompassId}` : ""}`,
    sectionSequence: index + 1,
    sectionUrl: option.modelUrl,
    diagramUrl: option.modelUrl,
    imageUrl: null,
    sectionFamily: "encompass_exploded_view_option",
    sourceStatus: "encompass_index_seeded",
    sourceFile: option.sourceFile,
    sourceRow: null,
    confidence: option.confidence,
    requiresHitl: true,
    isProviderSeedOption: true,
    nextAction: "Run Playwright discovery to expand this Encompass option into real assembly sections.",
  }));

  const candidateSections = [...providerCandidateSections, ...encompassOptionSections];

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
    encompassExplodedViewOptions,
    candidateSections,
    existingCounts: counts[0] || {},
    jobs,
    failureReason: candidateSections.length ? null : "NO_APPROVED_SECTION_MANIFEST_OR_ENCOMPASS_OPTION",
    recommendedAction: providerCandidateSections.length
      ? "Review candidate assembly sections, select the correct ones, then queue selected section extraction."
      : encompassExplodedViewOptions.length
        ? "Select an Encompass exploded-view option and run Playwright discovery to expand it into assembly sections."
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
