import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";
import { buildPricingSummary, hydrateBomPricesFromDb } from "@/src/features/bom/services/part-pricing-hydrator";

export const runtime = "nodejs";
export const maxDuration = 120;

type Row = Record<string, any>;

type PriceCandidate = {
  partNumber: string;
  source: string;
  price: number;
  currency: string;
  availability: string | null;
  priceUrl: string | null;
  evidence: string;
  capturedAt: string | null;
};

const SUPPLIER_PRIORITY = [
  { supplier: "encompass", source: "encompass.com", aliases: ["encompass", "encompass.com"] },
  { supplier: "reliableparts", source: "reliableparts.com", aliases: ["reliableparts", "reliable parts", "reliableparts.com"] },
  { supplier: "dlparts", source: "dlparts.com", aliases: ["dlparts", "d&lparts", "d&l parts", "d and l parts", "dandlparts", "dnlparts"] },
  { supplier: "searspartsdirect", source: "searspartsdirect.com", aliases: ["searspartsdirect", "sears partsdirect", "sears parts direct", "searspartsdirect.com"] },
  { supplier: "partsdr", source: "partsdr.com", aliases: ["partsdr", "parts dr", "partsdr.com"] },
  { supplier: "partselect", source: "partselect.com", aliases: ["partselect", "partselect.com"] },
  { supplier: "appliancepartspros", source: "appliancepartspros.com", aliases: ["appliancepartspros", "appliance parts pros", "appliancepartspros.com"] },
  { supplier: "repairclinic", source: "repairclinic.com", aliases: ["repairclinic", "repair clinic", "repairclinic.com"] },
  { supplier: "fix", source: "fix.com", aliases: ["fix.com", "fix"] },
  { supplier: "ebay", source: "ebay.com", aliases: ["ebay", "ebay.com"] },
] as const;

function normalizeModel(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizePartNumber(value: unknown) {
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
  for (const candidate of SUPPLIER_PRIORITY) {
    if (candidate.aliases.some((alias) => normalized.includes(alias))) return candidate;
  }
  return null;
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function parseMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) return null;
  const direct = Number(text.replace(/[$]/g, ""));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = text.match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function addCandidate(candidates: Map<string, PriceCandidate>, input: {
  partNumber: unknown;
  source: unknown;
  price: unknown;
  currency?: unknown;
  availability?: unknown;
  priceUrl?: unknown;
  evidence: string;
  capturedAt?: unknown;
}) {
  const partNumber = normalizePartNumber(input.partNumber);
  const price = parseMoney(input.price);
  const supplier = supplierForSource(input.source || input.priceUrl);
  if (!partNumber || price === null || !supplier) return;

  const candidate: PriceCandidate = {
    partNumber,
    source: supplier.source,
    price,
    currency: cleanText(input.currency) || "USD",
    availability: cleanText(input.availability),
    priceUrl: cleanText(input.priceUrl),
    evidence: input.evidence,
    capturedAt: toIso(input.capturedAt) || new Date().toISOString(),
  };

  const key = `${candidate.partNumber}|${candidate.source}`;
  const existing = candidates.get(key);
  if (!existing) {
    candidates.set(key, candidate);
    return;
  }

  const existingTime = existing.capturedAt ? Date.parse(existing.capturedAt) || 0 : 0;
  const candidateTime = candidate.capturedAt ? Date.parse(candidate.capturedAt) || 0 : 0;
  if (candidateTime > existingTime || (candidateTime === existingTime && candidate.price < existing.price)) {
    candidates.set(key, candidate);
  }
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

function normalizeInputPart(part: any, index: number, model: string) {
  const partNumber = normalizePartNumber(part?.partNumber || part?.part_number || part?.currentServicePartNumber || part?.current_service_part_number);
  if (!partNumber) return null;
  return {
    ...part,
    id: Number(part?.id) || index + 1,
    partNumber,
    description: cleanText(part?.description || part?.part_name) || partNumber,
    section: cleanText(part?.section || part?.section_name || part?.assemblyName) || "Source-backed BOM",
    compatibleModels: Array.isArray(part?.compatibleModels) ? part.compatibleModels : [model],
  };
}

export async function POST(request: Request) {
  const errors: Record<string, string> = {};

  try {
    const body = await request.json().catch(() => ({}));
    const inputModel = String(body.model || body.normalizedModel || "").trim();
    const normalizedModel = normalizeModel(inputModel);
    const inputParts = Array.isArray(body.parts) ? body.parts : [];

    if (!normalizedModel) {
      return NextResponse.json({ ok: false, error: "Missing model." }, { status: 400 });
    }

    const [modelRow] = await sql`
      insert into appliance_models (normalized_model, raw_model, retrieval_state, updated_at)
      values (${normalizedModel}, ${inputModel || normalizedModel}, 'pricing_cleanup_started', now())
      on conflict (normalized_model) do update set
        raw_model = coalesce(appliance_models.raw_model, excluded.raw_model),
        updated_at = now()
      returning id::text, normalized_model
    ` as Row[];

    const modelId = modelRow.id as string;
    const candidates = new Map<string, PriceCandidate>();

    for (const part of inputParts) {
      addCandidate(candidates, {
        partNumber: part?.partNumber || part?.part_number,
        source: part?.priceSource || part?.price_source || part?.priceSupplier || part?.sourceProvider || part?.source,
        price: part?.price || part?.retailPrice || part?.retail_price,
        currency: part?.priceCurrency || part?.currency || "USD",
        availability: part?.priceAvailability || part?.availability,
        priceUrl: part?.priceUrl || part?.price_url || part?.retailPriceUrl || part?.sourceUrl || part?.source_url,
        evidence: "current_ui_part_rows",
        capturedAt: part?.priceCheckedAt || part?.capturedAt || part?.captured_at,
      });
    }

    const capturedRows = await safeRows<Row>("bom_captured_part", errors, () => sql`
      select part_number, price, availability, source_url, updated_at, created_at
      from bom_captured_part
      where upper(regexp_replace(coalesce(model_number, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
        and part_number is not null
        and price is not null
        and review_status in ('reviewed', 'approved')
      order by updated_at desc nulls last, created_at desc nulls last
      limit 2000
    `);

    for (const row of capturedRows) {
      addCandidate(candidates, {
        partNumber: row.part_number,
        source: "encompass.com",
        price: row.price,
        currency: "USD",
        availability: row.availability,
        priceUrl: row.source_url,
        evidence: "bom_captured_part",
        capturedAt: row.updated_at || row.created_at,
      });
    }

    const rawRows = await safeRows<Row>("model_parts_raw", errors, () => sql`
      select raw_part_number, substitute_part_number, source, raw_payload, created_at
      from model_parts_raw
      where canonical_model = ${normalizedModel}
        and coalesce(raw_part_number, substitute_part_number) is not null
      order by created_at desc
      limit 4000
    `);

    for (const row of rawRows) {
      const payload = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
      addCandidate(candidates, {
        partNumber: row.substitute_part_number || row.raw_part_number,
        source: payload.price_source || payload.priceSource || row.source || payload.retailPriceSource,
        price: payload.parsed_price || payload.price || payload.part_price || payload.retailPrice,
        currency: payload.currency || "USD",
        availability: payload.availability || payload.retailAvailability,
        priceUrl: payload.price_url || payload.priceUrl || payload.retailPricingUrl || payload.source_url || payload.sourceUrl,
        evidence: "model_parts_raw",
        capturedAt: row.created_at,
      });
    }

    const cacheRows = await safeRows<Row>("model_parts_cache", errors, () => sql`
      select
        part ->> 'partNumber' as part_number,
        coalesce(part ->> 'currentServicePartNumber', part ->> 'current_service_part_number') as current_service_part_number,
        coalesce(part ->> 'priceSource', part ->> 'price_source', part ->> 'retailPriceSource', part ->> 'priceSupplier') as price_source,
        coalesce(part ->> 'price', part ->> 'retailPrice', part ->> 'retail_price') as price,
        coalesce(part ->> 'priceCurrency', part ->> 'currency') as currency,
        coalesce(part ->> 'priceAvailability', part ->> 'availability', part ->> 'retailAvailability') as availability,
        coalesce(part ->> 'priceUrl', part ->> 'price_url', part ->> 'retailPricingUrl', part ->> 'sourceUrl', part ->> 'source_url') as price_url,
        updated_at
      from model_parts_cache,
      lateral jsonb_array_elements(parts) as part
      where normalized_model = ${normalizedModel}
      limit 4000
    `);

    for (const row of cacheRows) {
      addCandidate(candidates, {
        partNumber: row.current_service_part_number || row.part_number,
        source: row.price_source || row.price_url,
        price: row.price,
        currency: row.currency || "USD",
        availability: row.availability,
        priceUrl: row.price_url,
        evidence: "model_parts_cache",
        capturedAt: row.updated_at,
      });
    }

    const upserted: PriceCandidate[] = [];
    for (const candidate of Array.from(candidates.values())) {
      await sql`
        insert into part_pricing (model_id, source, part_number, price, currency, availability, price_url, captured_at)
        values (
          ${modelId},
          ${candidate.source},
          ${candidate.partNumber},
          ${candidate.price},
          ${candidate.currency},
          ${candidate.availability},
          ${candidate.priceUrl},
          ${candidate.capturedAt ? new Date(candidate.capturedAt) : new Date()}
        )
        on conflict (model_id, source, part_number) do update set
          price = excluded.price,
          currency = excluded.currency,
          availability = excluded.availability,
          price_url = excluded.price_url,
          captured_at = excluded.captured_at
      `;
      upserted.push(candidate);
    }

    const sourceBackedRows = await safeRows<Row>("source_backed_parts", errors, () => sql`
      with provider_rows as (
        select
          coalesce(current_service_part_number, original_part_number) as part_number,
          description,
          coalesce(section_name_clean, section_label_raw, normalized_section) as section,
          provider as source_provider,
          coalesce(diagram_url, provider_assembly_url, provider_model_url) as source_url
        from provider_part_seed_rows
        where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
          and coalesce(current_service_part_number, original_part_number) is not null
      ),
      bom_rows as (
        select
          bp.part_number,
          bp.description,
          ba.assembly_name as section,
          bp.source as source_provider,
          coalesce(bp.source_url, ba.assembly_url, ba.diagram_url) as source_url
        from bom_parts bp
        left join bom_assemblies ba on ba.id = bp.assembly_id
        where bp.model_id = ${modelId}::uuid
          and bp.part_number is not null
      )
      select distinct on (upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')))
        upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')) as part_number,
        description,
        section,
        source_provider,
        source_url
      from (
        select * from provider_rows
        union all
        select * from bom_rows
      ) rows
      where part_number is not null and part_number <> ''
      order by upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')), section nulls last
      limit 1000
    `);

    const partsForHydration = inputParts
      .map((part: any, index: number) => normalizeInputPart(part, index, normalizedModel))
      .filter(Boolean) as Row[];

    const fallbackParts = sourceBackedRows.map((row, index) => ({
      id: index + 1,
      partNumber: normalizePartNumber(row.part_number),
      description: cleanText(row.description) || normalizePartNumber(row.part_number),
      section: cleanText(row.section) || "Source-backed BOM",
      compatibleModels: [normalizedModel],
      sourceProvider: row.source_provider,
      sourceUrl: row.source_url,
    }));

    const hydratedParts = await hydrateBomPricesFromDb({
      model: normalizedModel,
      parts: partsForHydration.length ? partsForHydration : fallbackParts,
    });

    const pricingSummary = buildPricingSummary(hydratedParts);
    const requiredPriceCount = Math.max(partsForHydration.length || fallbackParts.length || 0, pricingSummary.total);

    await sql`
      update appliance_models
      set
        required_price_count = greatest(coalesce(required_price_count, 0), ${requiredPriceCount}),
        verified_price_count = ${pricingSummary.priced},
        pricing_complete = ${pricingSummary.total > 0 && pricingSummary.missing === 0},
        retrieval_state = case
          when ${pricingSummary.total > 0 && pricingSummary.missing === 0} then 'pricing_complete'
          when ${pricingSummary.priced > 0} then 'pricing_partial'
          else retrieval_state
        end,
        updated_at = now()
      where id = ${modelId}::uuid
    `;

    return NextResponse.json({
      ok: true,
      model: normalizedModel,
      source: "db_first_pricing_cleanup",
      cleanupSummary: {
        candidatesFound: candidates.size,
        pricesWrittenToDb: upserted.length,
        inputParts: inputParts.length,
        sourceBackedParts: sourceBackedRows.length,
        evidenceCounts: {
          bomCapturedPart: capturedRows.length,
          modelPartsRaw: rawRows.length,
          modelPartsCache: cacheRows.length,
        },
        errors,
      },
      pricingSummary,
      parts: hydratedParts,
    });
  } catch (error) {
    console.error("[BOM Pricing Cleanup] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Pricing cleanup failed." },
      { status: 500 },
    );
  }
}
