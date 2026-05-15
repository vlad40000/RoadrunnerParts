import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type Row = Record<string, any>;

type QueryErrors = Record<string, string>;

const SUPPLIER_PRIORITY = [
  { supplier: "encompass", aliases: ["encompass", "encompass.com"] },
  { supplier: "reliableparts", aliases: ["reliableparts", "reliable parts", "reliableparts.com"] },
  { supplier: "dlparts", aliases: ["dlparts", "d&lparts", "d&l parts", "d and l parts", "dandlparts", "dnlparts"] },
  { supplier: "searspartsdirect", aliases: ["searspartsdirect", "sears partsdirect", "sears parts direct", "searspartsdirect.com"] },
  { supplier: "partsdr", aliases: ["partsdr", "parts dr", "partsdr.com"] },
  { supplier: "partselect", aliases: ["partselect", "partselect.com"] },
  { supplier: "appliancepartspros", aliases: ["appliancepartspros", "appliance parts pros", "appliancepartspros.com"] },
  { supplier: "repairclinic", aliases: ["repairclinic", "repair clinic", "repairclinic.com"] },
  { supplier: "fix", aliases: ["fix.com", "fix"] },
  { supplier: "ebay", aliases: ["ebay", "ebay.com"] },
] as const;

function normalizeModel(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizeSource(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/^www\./g, "")
    .replace(/[^a-z0-9&.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function supplierForSource(source: unknown) {
  const normalized = normalizeSource(source);
  for (let index = 0; index < SUPPLIER_PRIORITY.length; index += 1) {
    const candidate = SUPPLIER_PRIORITY[index];
    if (candidate.aliases.some((alias) => normalized.includes(alias))) {
      return { supplier: candidate.supplier, rank: index };
    }
  }
  return { supplier: normalized || "unknown", rank: 999 };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runRows<T extends Row>(label: string, queryErrors: QueryErrors, fn: () => Promise<unknown>) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch (error) {
    queryErrors[label] = errorMessage(error);
    return [] as T[];
  }
}

async function runCount(label: string, queryErrors: QueryErrors, fn: () => Promise<unknown>) {
  const rows = await runRows<{ count: number | string }>(label, queryErrors, fn);
  const value = rows[0]?.count;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstNonNull<T>(values: T[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? null;
}

function pickTrustedTotal(applianceModels: Row[]) {
  return {
    trustedTotalPartCount: firstNonNull(applianceModels.map((row) => row.trusted_total_part_count)) as number | null,
    trustedTotalCountSource: firstNonNull(applianceModels.map((row) => row.trusted_total_count_source)) as string | null,
    trustedTotalCountSourceUrl: firstNonNull(applianceModels.map((row) => row.trusted_total_count_source_url)) as string | null,
    trustedTotalCountCheckedAt: firstNonNull(applianceModels.map((row) => row.trusted_total_count_checked_at)) as string | null,
  };
}

function diagnose(input: {
  applianceModelCount: number;
  providerAssemblySectionsCount: number;
  providerPartSeedRowsCount: number;
  bomAssembliesCount: number;
  bomPartsCount: number;
  partPricingCount: number;
  pricingRowsMatchingApplianceModelIds: number;
  pricingRowsMatchingProviderSeedPartNumbers: number;
  pricingRowsMatchingProviderSeedPartNumbersAnyModel: number;
  sourceBackedPartsWithoutPricingCount: number;
  pricingRowsWithoutSourceBackedPartCount: number;
  distinctPricingSources: string[];
  queryErrors: QueryErrors;
}) {
  const providerSectionsPresent = input.providerAssemblySectionsCount > 0;
  const providerSeedRowsPresent = input.providerPartSeedRowsCount > 0;
  const bomRowsPresent = input.bomAssembliesCount > 0 || input.bomPartsCount > 0;
  const pricingRowsPresent = input.partPricingCount > 0;
  const unknownPricingSources = input.distinctPricingSources.filter((source) => supplierForSource(source).rank === 999);
  const pricingJoinLooksHealthy =
    pricingRowsPresent &&
    (input.pricingRowsMatchingProviderSeedPartNumbers > 0 || input.sourceBackedPartsWithoutPricingCount === 0);

  let likelyFailureMode = "UNKNOWN";

  if (Object.keys(input.queryErrors).length > 0) {
    likelyFailureMode = "UNKNOWN";
  } else if (input.applianceModelCount === 0) {
    likelyFailureMode = "NO_APPLIANCE_MODEL_ROW";
  } else if (!providerSectionsPresent) {
    likelyFailureMode = "NO_PROVIDER_DIAGRAM_SECTIONS";
  } else if (!providerSeedRowsPresent) {
    likelyFailureMode = "NO_PROVIDER_PART_SEED_ROWS";
  } else if (!bomRowsPresent) {
    likelyFailureMode = "NO_NORMALIZED_BOM_ROWS";
  } else if (!pricingRowsPresent && (providerSeedRowsPresent || bomRowsPresent)) {
    likelyFailureMode = "NO_PRICING_ROWS";
  } else if (
    input.pricingRowsMatchingProviderSeedPartNumbers === 0 &&
    input.pricingRowsMatchingProviderSeedPartNumbersAnyModel > 0
  ) {
    likelyFailureMode = "PRICING_MODEL_ID_MISMATCH";
  } else if (pricingRowsPresent && input.pricingRowsMatchingProviderSeedPartNumbers === 0) {
    likelyFailureMode = "PRICING_PART_NUMBER_MISMATCH";
  } else if (pricingRowsPresent && unknownPricingSources.length === input.distinctPricingSources.length) {
    likelyFailureMode = "SOURCE_NAME_PRIORITY_MISMATCH";
  } else if (providerSectionsPresent && providerSeedRowsPresent && pricingJoinLooksHealthy) {
    likelyFailureMode = "DB_LOOKS_HEALTHY_ROUTE_LOGIC_SUSPECT";
  }

  return {
    dbReadLooksHealthy:
      Object.keys(input.queryErrors).length === 0 &&
      (input.applianceModelCount > 0 || input.providerPartSeedRowsCount > 0 || input.providerAssemblySectionsCount > 0),
    providerSectionsPresent,
    providerSeedRowsPresent,
    bomRowsPresent,
    pricingRowsPresent,
    pricingJoinLooksHealthy,
    likelyFailureMode,
    unknownPricingSources,
  };
}

export async function GET(request: Request) {
  const queryErrors: QueryErrors = {};
  const { searchParams } = new URL(request.url);
  const inputModel = String(searchParams.get("model") || "").trim();
  const normalizedModel = normalizeModel(inputModel);

  if (!normalizedModel) {
    return NextResponse.json({ ok: false, error: "Missing model query parameter." }, { status: 400 });
  }

  const applianceModels = await runRows<Row>("appliance_models", queryErrors, () => sql`
    select
      id::text,
      raw_model as model_number,
      raw_model,
      normalized_model,
      brand,
      trusted_total_part_count,
      trusted_total_count_source,
      trusted_total_count_source_url,
      trusted_total_count_checked_at,
      retrieval_state,
      bom_complete,
      parts_complete,
      pricing_complete,
      actual_canonical_part_count,
      verified_price_count,
      required_price_count,
      updated_at
    from appliance_models
    where normalized_model = ${normalizedModel}
      or upper(regexp_replace(coalesce(raw_model, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    order by updated_at desc nulls last, created_at desc nulls last
    limit 20
  `);

  const modelIds = applianceModels.map((row) => String(row.id || "")).filter(Boolean);

  const counts = {
    model_parts_cache: await runCount("count:model_parts_cache", queryErrors, () => sql`
      select count(*)::int as count
      from model_parts_cache
      where normalized_model = ${normalizedModel}
    `),
    provider_model_routes: await runCount("count:provider_model_routes", queryErrors, () => sql`
      select count(*)::int as count
      from provider_model_routes
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    `),
    provider_assembly_sections: await runCount("count:provider_assembly_sections", queryErrors, () => sql`
      select count(*)::int as count
      from provider_assembly_sections
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    `),
    provider_part_seed_rows: await runCount("count:provider_part_seed_rows", queryErrors, () => sql`
      select count(*)::int as count
      from provider_part_seed_rows
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    `),
    bom_assemblies: modelIds.length
      ? await runCount("count:bom_assemblies", queryErrors, () => sql`
          select count(*)::int as count
          from bom_assemblies
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
    bom_parts: modelIds.length
      ? await runCount("count:bom_parts", queryErrors, () => sql`
          select count(*)::int as count
          from bom_parts
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
    part_pricing: modelIds.length
      ? await runCount("count:part_pricing", queryErrors, () => sql`
          select count(*)::int as count
          from part_pricing
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
    model_retrieval_summary: modelIds.length
      ? await runCount("count:model_retrieval_summary", queryErrors, () => sql`
          select count(*)::int as count
          from model_retrieval_summary
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
    model_source_urls: modelIds.length
      ? await runCount("count:model_source_urls", queryErrors, () => sql`
          select count(*)::int as count
          from model_source_urls
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
    retrieval_jobs: await runCount("count:retrieval_jobs", queryErrors, () => sql`
      select count(*)::int as count
      from retrieval_jobs
      where upper(regexp_replace(model_number, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
         or (${modelIds.length > 0} and model_id = any(${modelIds}::uuid[]))
    `),
    capture_artifacts: modelIds.length
      ? await runCount("count:capture_artifacts", queryErrors, () => sql`
          select count(*)::int as count
          from capture_artifacts
          where model_id = any(${modelIds}::uuid[])
        `)
      : 0,
  };

  const samples = {
    model_parts_cache: await runRows<Row>("sample:model_parts_cache", queryErrors, () => sql`
      select
        id,
        normalized_model,
        brand,
        category,
        case when jsonb_typeof(parts) = 'array' then jsonb_array_length(parts) else null end as cached_part_count,
        is_exhaustive,
        retrieval_state,
        trusted_total_part_count,
        trusted_total_count_source,
        trusted_total_count_source_url,
        actual_canonical_part_count,
        parts_complete,
        coverage_pct,
        truth_source,
        source_strategy,
        updated_at
      from model_parts_cache
      where normalized_model = ${normalizedModel}
      order by updated_at desc nulls last
      limit 10
    `),
    provider_model_routes: await runRows<Row>("sample:provider_model_routes", queryErrors, () => sql`
      select
        id,
        provider,
        model,
        brand,
        appliance_type,
        provider_model_url,
        provider_assembly_url,
        provider_option_value,
        source_status,
        source_file,
        source_row,
        created_at
      from provider_model_routes
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by created_at desc
      limit 10
    `),
    provider_assembly_sections: await runRows<Row>("sample:provider_assembly_sections", queryErrors, () => sql`
      select
        id,
        provider,
        model,
        section_seq,
        section_label_raw,
        section_name_clean,
        normalized_section,
        section_family,
        provider_assembly_url,
        diagram_url,
        image_url,
        source_status,
        source_file,
        source_row,
        created_at
      from provider_assembly_sections
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by section_seq nulls last, section_name_clean nulls last, created_at desc
      limit 10
    `),
    provider_part_seed_rows: await runRows<Row>("sample:provider_part_seed_rows", queryErrors, () => sql`
      select
        id,
        provider,
        model,
        section_label_raw,
        section_name_clean,
        normalized_section,
        diagram_number,
        original_part_number,
        current_service_part_number,
        description,
        provider_model_url,
        provider_assembly_url,
        diagram_url,
        source_status,
        source_file,
        source_row,
        created_at
      from provider_part_seed_rows
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      order by section_name_clean nulls last, diagram_number nulls last, current_service_part_number nulls last
      limit 10
    `),
    bom_assemblies: modelIds.length
      ? await runRows<Row>("sample:bom_assemblies", queryErrors, () => sql`
          select
            id::text,
            model_id::text,
            source,
            assembly_name,
            assembly_url,
            diagram_url,
            position,
            created_at
          from bom_assemblies
          where model_id = any(${modelIds}::uuid[])
          order by position nulls last, assembly_name asc
          limit 10
        `)
      : [],
    bom_parts: modelIds.length
      ? await runRows<Row>("sample:bom_parts", queryErrors, () => sql`
          select
            id::text,
            model_id::text,
            assembly_id::text,
            source,
            part_number,
            description,
            diagram_ref,
            quantity,
            source_url,
            confidence::text,
            created_at,
            updated_at
          from bom_parts
          where model_id = any(${modelIds}::uuid[])
          order by part_number asc
          limit 10
        `)
      : [],
    part_pricing: modelIds.length
      ? await runRows<Row>("sample:part_pricing", queryErrors, () => sql`
          select
            id::text,
            model_id::text,
            part_id::text,
            source,
            part_number,
            price::text,
            currency,
            availability,
            price_url,
            captured_at,
            evidence_artifact_id::text
          from part_pricing
          where model_id = any(${modelIds}::uuid[])
          order by captured_at desc, source asc
          limit 10
        `)
      : [],
    model_retrieval_summary: modelIds.length
      ? await runRows<Row>("sample:model_retrieval_summary", queryErrors, () => sql`
          select
            model_id::text,
            retrieval_state,
            expected_part_count,
            actual_part_count,
            priced_part_count,
            assembly_count,
            last_success_at,
            last_failure_at,
            error,
            updated_at
          from model_retrieval_summary
          where model_id = any(${modelIds}::uuid[])
          limit 10
        `)
      : [],
    model_source_urls: modelIds.length
      ? await runRows<Row>("sample:model_source_urls", queryErrors, () => sql`
          select
            id::text,
            model_id::text,
            source,
            url_type,
            url,
            status,
            http_status,
            last_checked_at,
            created_at
          from model_source_urls
          where model_id = any(${modelIds}::uuid[])
          order by created_at desc
          limit 10
        `)
      : [],
    retrieval_jobs: await runRows<Row>("sample:retrieval_jobs", queryErrors, () => sql`
      select
        id::text,
        bom_job_id,
        model_id::text,
        source_url_id::text,
        model_number,
        brand,
        source,
        job_type,
        status,
        priority,
        attempt_count,
        started_at,
        finished_at,
        error,
        created_at,
        updated_at
      from retrieval_jobs
      where upper(regexp_replace(model_number, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
         or (${modelIds.length > 0} and model_id = any(${modelIds}::uuid[]))
      order by created_at desc
      limit 10
    `),
    capture_artifacts: modelIds.length
      ? await runRows<Row>("sample:capture_artifacts", queryErrors, () => sql`
          select
            id::text,
            model_id::text,
            job_id::text,
            source,
            url,
            artifact_type,
            storage_path,
            content_hash,
            http_status,
            captured_at
          from capture_artifacts
          where model_id = any(${modelIds}::uuid[])
          order by captured_at desc
          limit 10
        `)
      : [],
  };

  const distinctPricingSources = modelIds.length
    ? (await runRows<{ source: string }>("pricing:distinct_sources", queryErrors, () => sql`
        select distinct source
        from part_pricing
        where model_id = any(${modelIds}::uuid[])
        order by source asc
      `)).map((row) => row.source).filter(Boolean)
    : [];

  const pricingRowsMatchingProviderSeedPartNumbers = modelIds.length
    ? await runCount("pricing:matching_provider_seed_part_numbers", queryErrors, () => sql`
        with seed_parts as (
          select distinct upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) as part_number
          from provider_part_seed_rows
          where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
            and coalesce(current_service_part_number, original_part_number) is not null
            and coalesce(current_service_part_number, original_part_number) <> ''
        )
        select count(distinct upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')))::int as count
        from part_pricing pp
        join seed_parts sp on sp.part_number = upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g'))
        where pp.model_id = any(${modelIds}::uuid[])
      `)
    : 0;

  const pricingRowsMatchingProviderSeedPartNumbersAnyModel = await runCount(
    "pricing:matching_provider_seed_part_numbers_any_model",
    queryErrors,
    () => sql`
      with seed_parts as (
        select distinct upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) as part_number
        from provider_part_seed_rows
        where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
          and coalesce(current_service_part_number, original_part_number) is not null
          and coalesce(current_service_part_number, original_part_number) <> ''
      )
      select count(distinct upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')))::int as count
      from part_pricing pp
      join seed_parts sp on sp.part_number = upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g'))
    `,
  );

  const sourceBackedPartsWithoutPricing = modelIds.length
    ? await runRows<Row>("pricing:source_backed_parts_without_pricing", queryErrors, () => sql`
        with source_parts as (
          select
            upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) as part_number,
            coalesce(section_name_clean, section_label_raw, normalized_section) as section_name,
            provider as source
          from provider_part_seed_rows
          where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
            and coalesce(current_service_part_number, original_part_number) is not null
            and coalesce(current_service_part_number, original_part_number) <> ''
          union all
          select
            upper(regexp_replace(bp.part_number, '[^A-Z0-9]', '', 'g')) as part_number,
            ba.assembly_name as section_name,
            bp.source
          from bom_parts bp
          left join bom_assemblies ba on ba.id = bp.assembly_id
          where bp.model_id = any(${modelIds}::uuid[])
            and bp.part_number is not null
            and bp.part_number <> ''
        ),
        price_parts as (
          select distinct upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')) as part_number
          from part_pricing
          where model_id = any(${modelIds}::uuid[])
            and price is not null
            and price > 0
        )
        select
          sp.part_number,
          max(sp.section_name) as section_name,
          max(sp.source) as source
        from source_parts sp
        where sp.part_number <> ''
          and not exists (select 1 from price_parts pp where pp.part_number = sp.part_number)
        group by sp.part_number
        order by sp.part_number asc
        limit 50
      `)
    : await runRows<Row>("pricing:source_backed_parts_without_pricing_no_model_id", queryErrors, () => sql`
        select
          upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) as part_number,
          coalesce(section_name_clean, section_label_raw, normalized_section) as section_name,
          provider as source
        from provider_part_seed_rows
        where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
          and coalesce(current_service_part_number, original_part_number) is not null
          and coalesce(current_service_part_number, original_part_number) <> ''
        order by part_number asc
        limit 50
      `);

  const pricingRowsWithoutSourceBackedPart = modelIds.length
    ? await runRows<Row>("pricing:rows_without_source_backed_part", queryErrors, () => sql`
        with source_parts as (
          select distinct upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) as part_number
          from provider_part_seed_rows
          where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
            and coalesce(current_service_part_number, original_part_number) is not null
            and coalesce(current_service_part_number, original_part_number) <> ''
          union
          select distinct upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')) as part_number
          from bom_parts
          where model_id = any(${modelIds}::uuid[])
            and part_number is not null
            and part_number <> ''
        )
        select
          upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) as part_number,
          pp.source,
          pp.price::text,
          pp.price_url
        from part_pricing pp
        where pp.model_id = any(${modelIds}::uuid[])
          and not exists (
            select 1
            from source_parts sp
            where sp.part_number = upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g'))
          )
        order by pp.captured_at desc
        limit 50
      `)
    : [];

  const diagramAssemblySections = await runRows<Row>("source_truth:diagram_assembly_sections", queryErrors, () => sql`
    with part_counts as (
      select
        coalesce(section_name_clean, section_label_raw, normalized_section, '') as section_name,
        count(*)::int as parts_count
      from provider_part_seed_rows
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
      group by 1
    )
    select
      pas.id::text as section_id,
      coalesce(pas.section_name_clean, pas.section_label_raw, pas.normalized_section, 'Uncategorized') as section_name,
      pas.provider as source,
      coalesce(pas.provider_assembly_url, pas.diagram_url) as source_url,
      pc.parts_count
    from provider_assembly_sections pas
    left join part_counts pc
      on pc.section_name = coalesce(pas.section_name_clean, pas.section_label_raw, pas.normalized_section, '')
    where upper(regexp_replace(pas.model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    order by pas.section_seq nulls last, section_name asc
    limit 100
  `);

  const sourceTruth = {
    ...pickTrustedTotal(applianceModels),
    diagramAssemblySections,
  };

  const diagnosis = diagnose({
    applianceModelCount: applianceModels.length,
    providerAssemblySectionsCount: counts.provider_assembly_sections,
    providerPartSeedRowsCount: counts.provider_part_seed_rows,
    bomAssembliesCount: counts.bom_assemblies,
    bomPartsCount: counts.bom_parts,
    partPricingCount: counts.part_pricing,
    pricingRowsMatchingApplianceModelIds: counts.part_pricing,
    pricingRowsMatchingProviderSeedPartNumbers,
    pricingRowsMatchingProviderSeedPartNumbersAnyModel,
    sourceBackedPartsWithoutPricingCount: sourceBackedPartsWithoutPricing.length,
    pricingRowsWithoutSourceBackedPartCount: pricingRowsWithoutSourceBackedPart.length,
    distinctPricingSources,
    queryErrors,
  });

  return NextResponse.json({
    ok: Object.keys(queryErrors).length === 0,
    inputModel,
    normalizedModel,
    applianceModels: {
      count: applianceModels.length,
      rows: applianceModels,
    },
    counts,
    samples,
    pricing: {
      distinctSources: distinctPricingSources,
      supplierPriority: SUPPLIER_PRIORITY.map((entry) => entry.supplier),
      pricingRowsMatchingApplianceModelIds: counts.part_pricing,
      pricingRowsMatchingProviderSeedPartNumbers,
      pricingRowsMatchingProviderSeedPartNumbersAnyModel,
      sourceBackedPartsWithoutPricing,
      pricingRowsWithoutSourceBackedPart,
    },
    sourceTruth,
    diagnosis,
    queryErrors,
  });
}
