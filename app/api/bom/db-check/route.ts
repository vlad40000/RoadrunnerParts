import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";
import { hydrateBomPricesFromDb } from "@/src/features/bom/services/part-pricing-hydrator";

export const runtime = "nodejs";

type Row = Record<string, any>;

function normalizeKey(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function stripLookupLabel(value: string) {
  return value.replace(/^\s*(MODEL|PART)\s*#?\s*:?\s*/i, "").trim();
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isNonEmpty(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function nonFallbackSection(section: unknown) {
  const text = String(section || "").trim().toLowerCase();
  return text !== "" && text !== "database evidence" && text !== "cached model evidence";
}

function sanitizeEbayUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!url) return undefined;
  if (/^https?:\/\/(?:www\.)?ebay\.com\/itm\/test(?:[-/?#]|$)/i.test(url)) return undefined;
  return url;
}

function partKeys(row: any) {
  return [
    row.partNumber,
    row.part_number,
    row.oem_number,
    row.originalPartNumber,
    row.original_part_number,
    row.currentServicePartNumber,
    row.current_service_part_number,
  ]
    .map((value) => normalizeKey(value))
    .filter(Boolean);
}

function toUiPart(row: any, index: number) {
  const partNumber = normalizeKey(
    firstValue(
      row.current_service_part_number,
      row.currentServicePartNumber,
      row.part_number,
      row.partNumber,
      row.original_part_number,
      row.originalPartNumber,
      row.oem_number,
    ),
  );

  const price = toNumber(firstValue(row.price, row.part_price, row.retailPrice, row.retail_price));
  const priceSource = firstValue(row.price_source, row.priceSource, row.retail_price_source, row.retailPriceSource, row.priceSupplier);
  const priceUrl = firstValue(row.price_url, row.priceUrl, row.retailPricingUrl, row.retail_price_url);
  const ebayPrice = toNumber(firstValue(row.ebay_price, row.ebayPrice));
  const ebayPriceSource = firstValue(row.ebay_price_source, row.ebayPriceSource, row.ebay_source, row.ebaySource);
  const ebayPriceUrl = sanitizeEbayUrl(firstValue(row.ebay_price_url, row.ebayPriceUrl, row.ebay_url, row.ebayUrl));
  const sourceUrl = firstValue(
    row.diagram_url,
    row.diagramUrl,
    row.provider_assembly_url,
    row.providerAssemblyUrl,
    row.provider_model_url,
    row.providerModelUrl,
    row.source_url,
    row.sourceUrl,
  );
  const diagramUrl = firstValue(
    row.diagram_url,
    row.diagramUrl,
    row.provider_assembly_url,
    row.providerAssemblyUrl,
    row.source_url,
    row.sourceUrl,
    String(priceUrl || "").includes("/Exploded-View-Assembly/") ? priceUrl : undefined,
  );
  const diagramRef = firstValue(
    row.diagram_ref,
    row.diagramRef,
    row.diagram_number,
    row.diagramNumber,
    row.callout,
    row.callout_number,
    row.calloutNumber,
  );

  return {
    id: index + 1,
    partNumber,
    description: row.description || row.part_name || "Appliance Part",
    section: row.section_name_clean || row.section_label_raw || row.assembly_name || row.section || "Database Evidence",
    compatibleModels: [row.model || row.normalized_model || row.raw_model].filter(Boolean),
    avgRating: 0,
    reviewCount: 0,
    price,
    priceSource,
    price_source: priceSource,
    priceUrl,
    price_url: priceUrl,
    ebayPrice,
    ebay_price: ebayPrice,
    ebayPriceSource,
    ebay_price_source: ebayPriceSource,
    ebayPriceUrl,
    ebay_price_url: ebayPriceUrl,
    diagramUrl,
    diagram_url: diagramUrl,
    diagramRef: diagramRef || undefined,
    diagram_ref: diagramRef || undefined,
    sourceProvider: row.provider || row.source_provider || row.source || undefined,
    sourceUrl,
    source_url: sourceUrl,
    sourceStatus: row.source_status || undefined,
    sourceFile: row.source_file || undefined,
    replacementNote: row.replacement_note || undefined,
    originalPartNumber: firstValue(row.original_part_number, row.originalPartNumber),
    currentServicePartNumber: firstValue(row.current_service_part_number, row.currentServicePartNumber),
  };
}

function partScore(part: any) {
  let score = 0;
  const priced = typeof part.price === "number" && part.price > 0 && isNonEmpty(part.priceSource);
  if (priced) score += 100;
  if (typeof part.ebayPrice === "number" && part.ebayPrice > 0) score += 20;
  if (isNonEmpty(part.diagramUrl)) score += 10;
  if (isNonEmpty(part.sourceUrl)) score += 10;
  if (nonFallbackSection(part.section)) score += 5;
  score += Math.min(10, String(part.description || "").trim().length / 20);
  return score;
}

function mergeParts(preferred: any, alternate: any) {
  return {
    ...alternate,
    ...preferred,
    description: isNonEmpty(preferred.description) ? preferred.description : alternate.description,
    section: nonFallbackSection(preferred.section) ? preferred.section : alternate.section,
    price: preferred.price ?? alternate.price,
    priceSource: isNonEmpty(preferred.priceSource) ? preferred.priceSource : alternate.priceSource,
    price_source: isNonEmpty(preferred.price_source) ? preferred.price_source : alternate.price_source,
    priceUrl: isNonEmpty(preferred.priceUrl) ? preferred.priceUrl : alternate.priceUrl,
    price_url: isNonEmpty(preferred.price_url) ? preferred.price_url : alternate.price_url,
    ebayPrice: preferred.ebayPrice ?? alternate.ebayPrice,
    ebay_price: preferred.ebay_price ?? alternate.ebay_price,
    ebayPriceSource: isNonEmpty(preferred.ebayPriceSource) ? preferred.ebayPriceSource : alternate.ebayPriceSource,
    ebay_price_source: isNonEmpty(preferred.ebay_price_source) ? preferred.ebay_price_source : alternate.ebay_price_source,
    ebayPriceUrl: isNonEmpty(preferred.ebayPriceUrl) ? preferred.ebayPriceUrl : alternate.ebayPriceUrl,
    ebay_price_url: isNonEmpty(preferred.ebay_price_url) ? preferred.ebay_price_url : alternate.ebay_price_url,
    diagramUrl: isNonEmpty(preferred.diagramUrl) ? preferred.diagramUrl : alternate.diagramUrl,
    diagram_url: isNonEmpty(preferred.diagram_url) ? preferred.diagram_url : alternate.diagram_url,
    sourceUrl: isNonEmpty(preferred.sourceUrl) ? preferred.sourceUrl : alternate.sourceUrl,
    source_url: isNonEmpty(preferred.source_url) ? preferred.source_url : alternate.source_url,
    originalPartNumber: isNonEmpty(preferred.originalPartNumber) ? preferred.originalPartNumber : alternate.originalPartNumber,
    currentServicePartNumber: isNonEmpty(preferred.currentServicePartNumber)
      ? preferred.currentServicePartNumber
      : alternate.currentServicePartNumber,
    compatibleModels: Array.from(new Set([...(preferred.compatibleModels || []), ...(alternate.compatibleModels || [])].filter(Boolean))),
  };
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

export async function GET(request: Request) {
  const errors: Record<string, string> = {};
  const { searchParams } = new URL(request.url);
  const model = stripLookupLabel(String(searchParams.get("model") || "").trim());
  const partNumber = stripLookupLabel(String(searchParams.get("partNumber") || "").trim());
  const normalizedModel = normalizeKey(model);
  const normalizedPart = normalizeKey(partNumber);
  const effectiveNormalizedPart = normalizedPart === normalizedModel ? "" : normalizedPart;

  if (!normalizedModel && !effectiveNormalizedPart) {
    return NextResponse.json({ ok: false, error: "Provide model or partNumber." }, { status: 400 });
  }

  const applianceRows = normalizedModel
    ? await safeRows<Row>("appliance_models", errors, () => sql`
        select
          id::text,
          normalized_model,
          raw_model,
          brand,
          appliance_type,
          trusted_total_part_count,
          trusted_total_count_source,
          trusted_total_count_source_url,
          trusted_total_count_checked_at,
          retrieval_state,
          actual_canonical_part_count,
          required_price_count,
          verified_price_count,
          parts_complete,
          pricing_complete
        from appliance_models
        where normalized_model = ${normalizedModel}
           or upper(regexp_replace(coalesce(raw_model, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
        order by updated_at desc nulls last, created_at desc nulls last
        limit 20
      `)
    : [];

  const modelIds = applianceRows.map((row) => String(row.id || "")).filter(Boolean);
  const expectedPartCount = Number(firstValue(...applianceRows.map((row) => row.trusted_total_part_count))) || null;

  const providerRows = effectiveNormalizedPart
    ? await safeRows<Row>("provider_part_seed_rows", errors, () => sql`
        select
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
        where (
          upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          or upper(regexp_replace(coalesce(original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
        )
        and (${normalizedModel} = '' or upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel})
        order by section_name_clean nulls last, diagram_number nulls last, current_service_part_number nulls last
        limit 2000
      `)
    : await safeRows<Row>("provider_part_seed_rows", errors, () => sql`
        select
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
        limit 2000
      `);

  const bomRows = modelIds.length
    ? await safeRows<Row>("bom_parts", errors, () => sql`
        select
          am.normalized_model,
          am.raw_model,
          bp.source as source_provider,
          bp.source,
          bp.part_number,
          bp.description,
          bp.diagram_ref,
          bp.quantity,
          bp.source_url,
          ba.assembly_name,
          ba.assembly_url as provider_assembly_url,
          ba.diagram_url,
          ba.position
        from bom_parts bp
        join appliance_models am on am.id = bp.model_id
        left join bom_assemblies ba on ba.id = bp.assembly_id
        where bp.model_id = any(${modelIds}::uuid[])
          and (${effectiveNormalizedPart} = '' or upper(regexp_replace(bp.part_number, '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart})
        order by ba.position nulls last, ba.assembly_name nulls last, bp.part_number asc
        limit 3000
      `)
    : [];

  const rawRows = effectiveNormalizedPart
    ? await safeRows<Row>("model_parts_raw", errors, () => sql`
        select
          canonical_model as normalized_model,
          null::text as raw_model,
          raw_part_number as part_number,
          substitute_part_number as current_service_part_number,
          raw_part_name as description,
          section_name as section,
          coalesce(
            diagram_ref,
            raw_payload ->> 'diagram_ref',
            raw_payload ->> 'diagramRef',
            raw_payload ->> 'diagram_number',
            raw_payload ->> 'diagramNumber',
            raw_payload ->> 'callout',
            raw_payload ->> 'callout_number'
          ) as diagram_ref,
          source as source_provider,
          source,
          coalesce(raw_payload ->> 'parsed_price', raw_payload ->> 'price', raw_payload ->> 'part_price') as price,
          coalesce(raw_payload ->> 'price_source', raw_payload ->> 'priceSource', raw_payload ->> 'retailPriceSource') as price_source,
          coalesce(raw_payload ->> 'price_url', raw_payload ->> 'priceUrl', raw_payload ->> 'retailPricingUrl') as price_url,
          coalesce(raw_payload ->> 'diagram_url', raw_payload ->> 'diagramUrl', raw_payload ->> 'providerAssemblyUrl') as diagram_url,
          coalesce(raw_payload ->> 'source_url', raw_payload ->> 'sourceUrl') as source_url,
          raw_payload ->> 'source_image_files' as source_file
        from model_parts_raw
        where upper(regexp_replace(coalesce(raw_part_number, substitute_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          and (${normalizedModel} = '' or canonical_model = ${normalizedModel})
        order by created_at desc
        limit 3000
      `)
    : await safeRows<Row>("model_parts_raw", errors, () => sql`
        select
          canonical_model as normalized_model,
          null::text as raw_model,
          raw_part_number as part_number,
          substitute_part_number as current_service_part_number,
          raw_part_name as description,
          section_name as section,
          coalesce(
            diagram_ref,
            raw_payload ->> 'diagram_ref',
            raw_payload ->> 'diagramRef',
            raw_payload ->> 'diagram_number',
            raw_payload ->> 'diagramNumber',
            raw_payload ->> 'callout',
            raw_payload ->> 'callout_number'
          ) as diagram_ref,
          source as source_provider,
          source,
          coalesce(raw_payload ->> 'parsed_price', raw_payload ->> 'price', raw_payload ->> 'part_price') as price,
          coalesce(raw_payload ->> 'price_source', raw_payload ->> 'priceSource', raw_payload ->> 'retailPriceSource') as price_source,
          coalesce(raw_payload ->> 'price_url', raw_payload ->> 'priceUrl', raw_payload ->> 'retailPricingUrl') as price_url,
          coalesce(raw_payload ->> 'diagram_url', raw_payload ->> 'diagramUrl', raw_payload ->> 'providerAssemblyUrl') as diagram_url,
          coalesce(raw_payload ->> 'source_url', raw_payload ->> 'sourceUrl') as source_url,
          raw_payload ->> 'source_image_files' as source_file
        from model_parts_raw
        where canonical_model = ${normalizedModel}
        order by created_at desc
        limit 3000
      `);

  const cacheRows = effectiveNormalizedPart
    ? await safeRows<Row>("model_parts_cache", errors, () => sql`
        select
          normalized_model,
          null::text as raw_model,
          part ->> 'partNumber' as part_number,
          coalesce(part ->> 'originalPartNumber', part ->> 'original_part_number') as original_part_number,
          coalesce(part ->> 'currentServicePartNumber', part ->> 'current_service_part_number') as current_service_part_number,
          coalesce(part ->> 'description', part ->> 'part_name') as description,
          coalesce(part ->> 'section', part ->> 'category') as section,
          coalesce(part ->> 'price', part ->> 'part_price', part ->> 'retailPrice') as price,
          coalesce(part ->> 'priceSource', part ->> 'price_source', part ->> 'retailPriceSource') as price_source,
          coalesce(part ->> 'priceUrl', part ->> 'price_url', part ->> 'retailPricingUrl', part ->> 'retail_price_url') as price_url,
          coalesce(part ->> 'diagramUrl', part ->> 'diagram_url') as diagram_url,
          coalesce(part ->> 'diagramRef', part ->> 'diagram_ref', part ->> 'diagramNumber', part ->> 'diagram_number', part ->> 'callout', part ->> 'callout_number') as diagram_ref,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where upper(regexp_replace(coalesce(part ->> 'partNumber', part ->> 'currentServicePartNumber', part ->> 'oem_number', ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          and (${normalizedModel} = '' or normalized_model = ${normalizedModel})
        limit 500
      `)
    : await safeRows<Row>("model_parts_cache", errors, () => sql`
        select
          normalized_model,
          null::text as raw_model,
          part ->> 'partNumber' as part_number,
          coalesce(part ->> 'originalPartNumber', part ->> 'original_part_number') as original_part_number,
          coalesce(part ->> 'currentServicePartNumber', part ->> 'current_service_part_number') as current_service_part_number,
          coalesce(part ->> 'description', part ->> 'part_name') as description,
          coalesce(part ->> 'section', part ->> 'category') as section,
          coalesce(part ->> 'price', part ->> 'part_price', part ->> 'retailPrice') as price,
          coalesce(part ->> 'priceSource', part ->> 'price_source', part ->> 'retailPriceSource') as price_source,
          coalesce(part ->> 'priceUrl', part ->> 'price_url', part ->> 'retailPricingUrl', part ->> 'retail_price_url') as price_url,
          coalesce(part ->> 'diagramUrl', part ->> 'diagram_url') as diagram_url,
          coalesce(part ->> 'diagramRef', part ->> 'diagram_ref', part ->> 'diagramNumber', part ->> 'diagram_number', part ->> 'callout', part ->> 'callout_number') as diagram_ref,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where normalized_model = ${normalizedModel}
        limit 500
      `);

  const pricingRows = modelIds.length
    ? await safeRows<Row>("part_pricing", errors, () => sql`
        select
          am.normalized_model,
          pp.part_number,
          pp.price::text as price,
          pp.source as price_source,
          pp.price_url as price_url,
          pp.price_url as source_url,
          pp.availability,
          pp.captured_at,
          'part_pricing' as source_provider
        from part_pricing pp
        join appliance_models am on pp.model_id = am.id
        where pp.model_id = any(${modelIds}::uuid[])
          and (${effectiveNormalizedPart} = '' or upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart})
          and pp.price is not null
          and pp.price > 0
        order by pp.captured_at desc
        limit 3000
      `)
    : [];

  const priceByPart = new Map<string, Row>();
  for (const row of pricingRows) {
    for (const key of partKeys(row)) {
      if (!priceByPart.has(key)) priceByPart.set(key, row);
    }
  }

  const sourceBackedRows = [...providerRows, ...bomRows, ...rawRows];

  // For model lookups, cache is not allowed to be the source of truth unless there is no
  // source-backed row at all AND the cached payload has more than a trivial one-row result.
  // This prevents stale cache garbage from becoming a fake model BOM.
  const cacheAllowedAsBase = Boolean(effectiveNormalizedPart) || (sourceBackedRows.length === 0 && cacheRows.length >= 5);
  const pricingAllowedAsBase = sourceBackedRows.length === 0 && cacheRows.length === 0 && pricingRows.length > 0;

  const baseRows = [
    ...sourceBackedRows,
    ...(cacheAllowedAsBase ? cacheRows : []),
    ...(pricingAllowedAsBase ? pricingRows : []),
  ];

  const rowsWithPrices = baseRows.map((row) => {
    const pricedMatch = partKeys(row).map((key) => priceByPart.get(key)).find(Boolean);
    if (!pricedMatch) return row;
    return {
      ...row,
      price: pricedMatch.price,
      price_source: pricedMatch.price_source,
      price_url: pricedMatch.price_url,
      source_url: row.source_url || pricedMatch.source_url,
    };
  });

  const deduped = new Map<string, any>();
  for (const part of rowsWithPrices.map(toUiPart)) {
    if (!part.partNumber) continue;
    const key = normalizeKey(part.partNumber);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, part);
      continue;
    }
    const preferred = partScore(part) >= partScore(existing) ? part : existing;
    const alternate = preferred === part ? existing : part;
    deduped.set(key, mergeParts(preferred, alternate));
  }

  let parts = Array.from(deduped.values()).sort((a, b) => {
    const sectionCompare = String(a.section || "").localeCompare(String(b.section || ""));
    if (sectionCompare !== 0) return sectionCompare;
    return String(a.partNumber || "").localeCompare(String(b.partNumber || ""));
  });

  if (parts.length > 0 && normalizedModel) {
    parts = await hydrateBomPricesFromDb({ model: normalizedModel, parts });
  }

  parts = parts.map((part, index) => ({ ...part, id: index + 1 }));

  const sourceBackedCount = sourceBackedRows.length;
  const retrievalState = parts.length
    ? sourceBackedCount > 0
      ? "source_backed_db_evidence_found"
      : "cache_or_pricing_only_evidence_found"
    : "not_found";

  return NextResponse.json({
    ok: true,
    model: model || null,
    partNumber: partNumber || null,
    normalizedModel: normalizedModel || null,
    normalizedPartNumber: effectiveNormalizedPart || null,
    count: parts.length,
    expectedPartCount,
    expectedPartCountSource: firstValue(...applianceRows.map((row) => row.trusted_total_count_source)) || null,
    expectedPartCountSourceUrl: firstValue(...applianceRows.map((row) => row.trusted_total_count_source_url)) || null,
    applianceModels: applianceRows,
    sourceCounts: {
      applianceModels: applianceRows.length,
      providerSeedRows: providerRows.length,
      normalizedBomRows: bomRows.length,
      rawEvidenceRows: rawRows.length,
      modelPartsCacheRows: cacheRows.length,
      partPricingRows: pricingRows.length,
      sourceBackedRows: sourceBackedCount,
      cacheAllowedAsBase,
      pricingAllowedAsBase,
    },
    retrievalState,
    warnings: [
      !sourceBackedCount && cacheRows.length > 0 && !cacheAllowedAsBase
        ? "MODEL_CACHE_IGNORED_AS_SOURCE_TRUTH_TOO_SMALL_OR_UNTRUSTED"
        : null,
      !sourceBackedCount ? "NO_SOURCE_BACKED_MODEL_BOM_ROWS_FOUND" : null,
      errors && Object.keys(errors).length ? "DB_QUERY_ERRORS_PRESENT" : null,
    ].filter(Boolean),
    errors,
    parts,
  });
}
