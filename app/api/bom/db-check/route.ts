import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

function normalizeKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toUiPart(row: any, index: number) {
  const partNumber = String(
    row.current_service_part_number ||
      row.original_part_number ||
      row.part_number ||
      row.oem_number ||
      "",
  )
    .trim()
    .toUpperCase();

  return {
    id: index + 1,
    partNumber,
    description: row.description || row.part_name || "Appliance Part",
    section: row.section_name_clean || row.section_label_raw || row.section || "Database Evidence",
    compatibleModels: [row.model || row.normalized_model || row.raw_model].filter(Boolean),
    avgRating: 0,
    reviewCount: 0,
    price: row.price ? Number(row.price) : undefined,
    priceSource: row.price_source || row.retail_price_source || undefined,
    sourceProvider: row.provider || row.source_provider || row.source || undefined,
    sourceUrl: row.diagram_url || row.provider_assembly_url || row.provider_model_url || row.source_url || undefined,
    sourceStatus: row.source_status || undefined,
    sourceFile: row.source_file || undefined,
    replacementNote: row.replacement_note || undefined,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = String(searchParams.get("model") || "").trim();
  const partNumber = String(searchParams.get("partNumber") || "").trim();
  const normalizedModel = normalizeKey(model);
  const normalizedPart = normalizeKey(partNumber);

  if (!normalizedModel && !normalizedPart) {
    return NextResponse.json(
      { ok: false, error: "Provide model or partNumber." },
      { status: 400 },
    );
  }

  const providerRows = normalizedPart
    ? await sql`
        select *
        from provider_part_seed_rows
        where (
          upper(regexp_replace(coalesce(current_service_part_number, original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedPart}
          or upper(regexp_replace(coalesce(original_part_number, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedPart}
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

  const cachedRows = normalizedPart
    ? await sql`
        select
          normalized_model,
          null::text as raw_model,
          part ->> 'partNumber' as part_number,
          coalesce(part ->> 'description', part ->> 'part_name') as description,
          coalesce(part ->> 'section', part ->> 'category') as section,
          part ->> 'price' as price,
          coalesce(part ->> 'priceSource', part ->> 'retailPriceSource') as price_source,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where upper(regexp_replace(coalesce(part ->> 'partNumber', part ->> 'currentServicePartNumber', part ->> 'oem_number', ''), '[^A-Z0-9]', '', 'g')) = ${normalizedPart}
          and (${normalizedModel} = '' or normalized_model = ${normalizedModel})
        limit 500
      `
    : await sql`
        select
          normalized_model,
          null::text as raw_model,
          part ->> 'partNumber' as part_number,
          coalesce(part ->> 'description', part ->> 'part_name') as description,
          coalesce(part ->> 'section', part ->> 'category') as section,
          part ->> 'price' as price,
          coalesce(part ->> 'priceSource', part ->> 'retailPriceSource') as price_source,
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where normalized_model = ${normalizedModel}
        limit 500
      `;

  const providerResultRows = Array.isArray(providerRows) ? (providerRows as any[]) : [];
  const cachedResultRows = Array.isArray(cachedRows) ? (cachedRows as any[]) : [];
  const rows = [...providerResultRows, ...cachedResultRows];
  const seen = new Set<string>();
  const parts = rows
    .map(toUiPart)
    .filter((part) => {
      const key = `${part.partNumber}|${part.section}|${part.description}`;
      if (!part.partNumber || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return NextResponse.json({
    ok: true,
    model: model || null,
    partNumber: partNumber || null,
    normalizedModel: normalizedModel || null,
    normalizedPartNumber: normalizedPart || null,
    count: parts.length,
    sourceCounts: {
      providerSeedRows: providerResultRows.length,
      modelPartsCacheRows: cachedResultRows.length,
    },
    retrievalState: parts.length ? "db_evidence_found" : "not_found",
    parts,
  });
}
