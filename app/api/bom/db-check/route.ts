import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

function normalizeKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function firstValue(...values: Array<unknown>) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function toNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    sourceProvider: row.provider || row.source_provider || row.source || undefined,
    sourceUrl: row.diagram_url || row.provider_assembly_url || row.provider_model_url || row.source_url || undefined,
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
  const model = String(searchParams.get("model") || "").trim();
  const partNumber = String(searchParams.get("partNumber") || "").trim();
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
          coalesce(part ->> 'sourceUrl', part ->> 'retailPricingUrl') as source_url,
          'model_parts_cache' as source_provider
        from model_parts_cache,
        lateral jsonb_array_elements(parts) as part
        where normalized_model = ${normalizedModel}
        limit 500
      `;

  const providerResultRows = Array.isArray(providerRows) ? (providerRows as any[]) : [];
  const cachedResultRows = Array.isArray(cachedRows) ? (cachedRows as any[]) : [];
  const cachePriceByPart = new Map<string, any>();
  for (const row of cachedResultRows) {
    for (const key of partKeys(row)) {
      if (!cachePriceByPart.has(key)) {
        cachePriceByPart.set(key, row);
      }
    }
  }

  const rows = [...providerResultRows, ...cachedResultRows].map((row) => {
    const pricedMatch = partKeys(row).map((key) => cachePriceByPart.get(key)).find(Boolean);
    if (!pricedMatch || row.price) return row;
    return {
      ...pricedMatch,
      ...row,
      price: pricedMatch.price,
      price_source: pricedMatch.price_source,
      source_url: row.source_url || pricedMatch.source_url,
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
    },
    retrievalState: parts.length ? "db_evidence_found" : "not_found",
    parts,
  });
}
