import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

function normalizeKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function stripLookupLabel(value: string) {
  return value.replace(/^\s*(MODEL|PART)\s*#?\s*:?\s*/i, "").trim();
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeEbayUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!url) return undefined;
  if (/^https?:\/\/(?:www\.)?ebay\.com\/itm\/test(?:[-/?#]|$)/i.test(url)) {
    return undefined;
  }
  return url;
}

function toUiPart(row: any, index: number) {
  const partNumber = String(
    firstValue(
      row.current_service_part_number,
      row.currentServicePartNumber,
      row.part_number,
      row.partNumber,
      row.original_part_number,
      row.originalPartNumber,
      row.oem_number,
    ) || "",
  )
    .trim()
    .toUpperCase();

  const price = toNumber(firstValue(row.price, row.part_price, row.retailPrice, row.retail_price));
  const priceSource = firstValue(row.price_source, row.priceSource, row.retail_price_source, row.retailPriceSource);
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

  return {
    id: index + 1,
    partNumber,
    description: row.description || row.part_name || "Appliance Part",
    section: row.section_name_clean || row.section_label_raw || row.section || "Database Evidence",
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
    diagramRef: row.diagram_ref || row.diagramRef || undefined,
    diagram_ref: row.diagram_ref || row.diagramRef || undefined,
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
    .map((value) => normalizeKey(String(value || "")))
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = stripLookupLabel(String(searchParams.get("model") || "").trim());
  const partNumber = stripLookupLabel(String(searchParams.get("partNumber") || "").trim());
  const normalizedModel = normalizeKey(model);
  const normalizedPart = normalizeKey(partNumber);
  const effectiveNormalizedPart = normalizedPart === normalizedModel ? "" : normalizedPart;

  if (!normalizedModel && !effectiveNormalizedPart) {
    return NextResponse.json(
      { ok: false, error: "Provide model or partNumber." },
      { status: 400 },
    );
  }

  const providerRows = effectiveNormalizedPart
    ? await sql`
        select *
        from provider_part_seed_rows
        where (
          upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          or upper(regexp_replace(coalesce(original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
        )
        and (${normalizedModel} = '' or upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel})
        order by created_at desc
        limit 500
      `
    : await sql`
        select *
        from provider_part_seed_rows
        where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
        order by created_at desc
        limit 500
      `;

  const cachedRows = effectiveNormalizedPart
    ? await sql`
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
          coalesce(part ->> 'diagramRef', part ->> 'diagram_ref') as diagram_ref,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where upper(regexp_replace(coalesce(part ->> 'partNumber', part ->> 'currentServicePartNumber', part ->> 'oem_number', ''), '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          and (${normalizedModel} = '' or normalized_model = ${normalizedModel})
        limit 500
      `
    : await sql`
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
          coalesce(part ->> 'diagramRef', part ->> 'diagram_ref') as diagram_ref,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where normalized_model = ${normalizedModel}
        limit 500
      `;

  const partPricingRows = effectiveNormalizedPart
    ? await sql`
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
        where upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          and (
            lower(pp.source) like '%encompass.com%'
            or lower(pp.source) like '%searspartsdirect.com%'
            or lower(pp.source) like '%fix.com%'
          )
          and (${normalizedModel} = '' or am.normalized_model = ${normalizedModel})
        order by pp.captured_at desc
        limit 500
      `
    : await sql`
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
        where am.normalized_model = ${normalizedModel}
          and (
            lower(pp.source) like '%encompass.com%'
            or lower(pp.source) like '%searspartsdirect.com%'
            or lower(pp.source) like '%fix.com%'
          )
        order by pp.captured_at desc
        limit 500
      `;

  const ebayPricingRows = effectiveNormalizedPart
    ? await sql`
        select
          am.normalized_model,
          pp.part_number,
          pp.price::text as ebay_price,
          pp.source as ebay_price_source,
          pp.price_url as ebay_price_url,
          pp.price_url as source_url,
          pp.availability,
          pp.captured_at,
          'part_pricing_ebay' as source_provider
        from part_pricing pp
        join appliance_models am on pp.model_id = am.id
        where upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) = ${effectiveNormalizedPart}
          and lower(pp.source) like '%ebay%'
          and (${normalizedModel} = '' or am.normalized_model = ${normalizedModel})
        order by pp.captured_at desc
        limit 500
      `
    : await sql`
        select
          am.normalized_model,
          pp.part_number,
          pp.price::text as ebay_price,
          pp.source as ebay_price_source,
          pp.price_url as ebay_price_url,
          pp.price_url as source_url,
          pp.availability,
          pp.captured_at,
          'part_pricing_ebay' as source_provider
        from part_pricing pp
        join appliance_models am on pp.model_id = am.id
        where am.normalized_model = ${normalizedModel}
          and lower(pp.source) like '%ebay%'
        order by pp.captured_at desc
        limit 500
      `;

  const canonicalDiagramRows = normalizedModel
    ? await sql`
        select msu.url
        from model_source_urls msu
        join appliance_models am on msu.model_id = am.id
        where am.normalized_model = ${normalizedModel}
          and msu.source = 'encompass'
          and msu.url_type in ('partstore_assembly', 'exploded_view_assembly')
        order by
          case when msu.url_type = 'partstore_assembly' then 0 else 1 end,
          msu.created_at desc
        limit 1
      `
    : [];

  const rawRows = effectiveNormalizedPart
    ? await sql`
        select
          canonical_model as normalized_model,
          null::text as raw_model,
          raw_part_number as part_number,
          substitute_part_number as current_service_part_number,
          raw_part_name as description,
          section_name as section,
          diagram_ref,
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
        limit 1000
      `
    : await sql`
        select
          canonical_model as normalized_model,
          null::text as raw_model,
          raw_part_number as part_number,
          substitute_part_number as current_service_part_number,
          raw_part_name as description,
          section_name as section,
          diagram_ref,
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
        limit 1000
      `;

  const providerResultRows = Array.isArray(providerRows) ? (providerRows as any[]) : [];
  const cachedResultRows = Array.isArray(cachedRows) ? (cachedRows as any[]) : [];
  const partPricingResultRows = Array.isArray(partPricingRows) ? (partPricingRows as any[]) : [];
  const ebayPricingResultRows = Array.isArray(ebayPricingRows) ? (ebayPricingRows as any[]) : [];
  const rawResultRows = Array.isArray(rawRows) ? (rawRows as any[]) : [];
  const canonicalDiagramUrl = firstValue(...(Array.isArray(canonicalDiagramRows) ? (canonicalDiagramRows as any[]).map((row) => row.url) : []));
  const verifiedPriceByPart = new Map<string, any>();
  for (const row of partPricingResultRows) {
    for (const key of partKeys(row)) {
      if (!verifiedPriceByPart.has(key)) {
        verifiedPriceByPart.set(key, row);
      }
    }
  }
  for (const row of cachedResultRows) {
    for (const key of partKeys(row)) {
      if (!verifiedPriceByPart.has(key)) {
        verifiedPriceByPart.set(key, row);
      }
    }
  }
  const ebayPriceByPart = new Map<string, any>();
  for (const row of ebayPricingResultRows) {
    for (const key of partKeys(row)) {
      if (!ebayPriceByPart.has(key)) {
        ebayPriceByPart.set(key, row);
      }
    }
  }

  const rows = [...providerResultRows, ...cachedResultRows, ...rawResultRows].map((row) => {
    const rowDiagramUrl = firstValue(row.diagram_url, row.provider_assembly_url, row.source_url);
    const rowEncompassDiagramUrl = String(rowDiagramUrl || "").toLowerCase().includes("encompass")
      ? rowDiagramUrl
      : undefined;
    const pricedMatch = partKeys(row).map((key) => verifiedPriceByPart.get(key)).find(Boolean);
    const ebayMatch = partKeys(row).map((key) => ebayPriceByPart.get(key)).find(Boolean);
    if (!pricedMatch) {
      return {
        ...row,
        ebay_price: ebayMatch?.ebay_price,
        ebay_price_source: ebayMatch?.ebay_price_source,
        ebay_price_url: ebayMatch?.ebay_price_url || ebayMatch?.source_url,
        diagram_url: rowEncompassDiagramUrl || canonicalDiagramUrl || rowDiagramUrl,
      };
    }
    const pricedSourceUrl = firstValue(pricedMatch.price_url, pricedMatch.source_url);
    const verifiedDiagramUrl = String(pricedMatch.price_source || "").toLowerCase().includes("encompass")
      ? pricedSourceUrl
      : undefined;
    return {
      ...row,
      price: pricedMatch.price,
      price_source: pricedMatch.price_source,
      price_url: pricedSourceUrl,
      ebay_price: ebayMatch?.ebay_price,
      ebay_price_source: ebayMatch?.ebay_price_source,
      ebay_price_url: ebayMatch?.ebay_price_url || ebayMatch?.source_url,
      source_url: row.source_url || pricedMatch.source_url,
      diagram_url: verifiedDiagramUrl || rowEncompassDiagramUrl || canonicalDiagramUrl || rowDiagramUrl || pricedSourceUrl,
    };
  });
  const seen = new Set<string>();
  const parts = rows
    .map(toUiPart)
    .filter((part) => {
      const key = `${part.partNumber}|${part.section}|${part.description}`;
      if (!part.partNumber || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aPriced = typeof a.price === "number" && a.price > 0 && a.priceSource ? 1 : 0;
      const bPriced = typeof b.price === "number" && b.price > 0 && b.priceSource ? 1 : 0;
      if (aPriced !== bPriced) return bPriced - aPriced;
      const sectionCompare = String(a.section || "").localeCompare(String(b.section || ""));
      if (sectionCompare !== 0) return sectionCompare;
      return String(a.partNumber || "").localeCompare(String(b.partNumber || ""));
    });

  return NextResponse.json({
    ok: true,
    model: model || null,
    partNumber: partNumber || null,
    normalizedModel: normalizedModel || null,
    normalizedPartNumber: effectiveNormalizedPart || null,
    count: parts.length,
    sourceCounts: {
      providerSeedRows: providerResultRows.length,
      modelPartsCacheRows: cachedResultRows.length,
      partPricingRows: partPricingResultRows.length,
      ebayPricingRows: ebayPricingResultRows.length,
      rawEvidenceRows: rawResultRows.length,
    },
    retrievalState: parts.length ? "db_evidence_found" : "not_found",
    parts,
  });
}
