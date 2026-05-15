import { NextResponse } from "next/server";
import { sql } from "@/src/server/db";

export const runtime = "nodejs";

type Row = Record<string, any>;

function normalizeModel(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizePartNumber(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizeSectionKey(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSectionName(value: unknown) {
  return String(value || "").trim();
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stateForSection(input: {
  expectedPartCount: number;
  foundPartCount: number;
  pricedPartCount: number;
}) {
  if (input.expectedPartCount <= 0) return "unknown_expected_count";
  if (input.foundPartCount <= 0) return "parts_missing";
  if (input.foundPartCount < input.expectedPartCount) return "parts_partial";
  if (input.pricedPartCount < input.expectedPartCount) return "pricing_partial";
  return "complete";
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
  const inputModel = String(searchParams.get("model") || "").trim();
  const normalizedModel = normalizeModel(inputModel);

  if (!normalizedModel) {
    return NextResponse.json({ ok: false, error: "Model parameter is required." }, { status: 400 });
  }

  const applianceRows = await safeRows<Row>("appliance_models", errors, () => sql`
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
      actual_canonical_part_count,
      required_price_count,
      verified_price_count,
      retrieval_state,
      parts_complete,
      pricing_complete
    from appliance_models
    where normalized_model = ${normalizedModel}
       or upper(regexp_replace(coalesce(raw_model, ''), '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    order by updated_at desc nulls last, created_at desc nulls last
    limit 20
  `);

  const modelIds = applianceRows.map((row) => String(row.id || "")).filter(Boolean);

  const providerSections = await safeRows<Row>("provider_assembly_sections", errors, () => sql`
    select
      id::text,
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
      source_row
    from provider_assembly_sections
    where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    order by section_seq nulls last, section_name_clean nulls last
  `);

  const providerPartRows = await safeRows<Row>("provider_part_seed_rows", errors, () => sql`
    select
      provider,
      model,
      section_label_raw,
      section_name_clean,
      normalized_section,
      section_family,
      diagram_number,
      original_part_number,
      current_service_part_number,
      description,
      provider_model_url,
      provider_assembly_url,
      diagram_url,
      source_status,
      source_file,
      source_row
    from provider_part_seed_rows
    where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
    limit 10000
  `);

  const bomRows = modelIds.length
    ? await safeRows<Row>("bom_parts", errors, () => sql`
        select
          bp.part_number,
          bp.description,
          bp.diagram_ref,
          bp.source_url,
          bp.source,
          ba.id::text as assembly_id,
          ba.assembly_name,
          ba.assembly_url,
          ba.diagram_url,
          ba.position
        from bom_parts bp
        left join bom_assemblies ba on ba.id = bp.assembly_id
        where bp.model_id = any(${modelIds}::uuid[])
        limit 10000
      `)
    : [];

  const pricingRows = modelIds.length
    ? await safeRows<Row>("part_pricing", errors, () => sql`
        select
          upper(regexp_replace(part_number, '[^A-Z0-9]', '', 'g')) as part_number,
          source,
          price::text as price,
          price_url,
          availability,
          captured_at
        from part_pricing
        where model_id = any(${modelIds}::uuid[])
          and price is not null
          and price > 0
        limit 10000
      `)
    : [];

  const pricedParts = new Set(pricingRows.map((row) => normalizePartNumber(row.part_number)).filter(Boolean));
  const sectionMap = new Map<string, any>();
  const globalSourceBackedParts = new Set<string>();

  function ensureSection(input: {
    sectionName: unknown;
    source?: unknown;
    sourceUrl?: unknown;
    diagramUrl?: unknown;
    imageUrl?: unknown;
    sectionSeq?: unknown;
    sourceTable: string;
  }) {
    const sectionName = cleanSectionName(input.sectionName) || "Uncategorized";
    const sectionKey = normalizeSectionKey(sectionName) || "UNCATEGORIZED";
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        sectionId: sectionKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized",
        sectionKey,
        sectionName,
        source: cleanSectionName(input.source) || null,
        sourceUrl: cleanSectionName(input.sourceUrl) || null,
        diagramUrl: cleanSectionName(input.diagramUrl) || null,
        imageUrl: cleanSectionName(input.imageUrl) || null,
        sectionSeq: positiveNumber(input.sectionSeq),
        sourceTables: new Set<string>([input.sourceTable]),
        expectedParts: new Set<string>(),
        foundParts: new Set<string>(),
        pricedParts: new Set<string>(),
      });
    } else {
      const existing = sectionMap.get(sectionKey);
      existing.source ||= cleanSectionName(input.source) || null;
      existing.sourceUrl ||= cleanSectionName(input.sourceUrl) || null;
      existing.diagramUrl ||= cleanSectionName(input.diagramUrl) || null;
      existing.imageUrl ||= cleanSectionName(input.imageUrl) || null;
      existing.sectionSeq ??= positiveNumber(input.sectionSeq);
      existing.sourceTables.add(input.sourceTable);
    }
    return sectionMap.get(sectionKey);
  }

  for (const row of providerSections) {
    ensureSection({
      sectionName: row.section_name_clean || row.section_label_raw || row.normalized_section,
      source: row.provider,
      sourceUrl: row.provider_assembly_url || row.diagram_url,
      diagramUrl: row.diagram_url,
      imageUrl: row.image_url,
      sectionSeq: row.section_seq,
      sourceTable: "provider_assembly_sections",
    });
  }

  for (const row of providerPartRows) {
    const partNumber = normalizePartNumber(row.current_service_part_number || row.original_part_number);
    const section = ensureSection({
      sectionName: row.section_name_clean || row.section_label_raw || row.normalized_section,
      source: row.provider,
      sourceUrl: row.provider_assembly_url || row.diagram_url || row.provider_model_url,
      diagramUrl: row.diagram_url,
      sectionSeq: null,
      sourceTable: "provider_part_seed_rows",
    });
    if (partNumber) {
      section.expectedParts.add(partNumber);
      section.foundParts.add(partNumber);
      if (pricedParts.has(partNumber)) section.pricedParts.add(partNumber);
      globalSourceBackedParts.add(partNumber);
    }
  }

  for (const row of bomRows) {
    const partNumber = normalizePartNumber(row.part_number);
    const section = ensureSection({
      sectionName: row.assembly_name,
      source: row.source,
      sourceUrl: row.assembly_url || row.diagram_url || row.source_url,
      diagramUrl: row.diagram_url,
      sectionSeq: row.position,
      sourceTable: "bom_parts",
    });
    if (partNumber) {
      section.foundParts.add(partNumber);
      section.expectedParts.add(partNumber);
      if (pricedParts.has(partNumber)) section.pricedParts.add(partNumber);
      globalSourceBackedParts.add(partNumber);
    }
  }

  const sections = Array.from(sectionMap.values())
    .map((section) => {
      const expectedPartCount = section.expectedParts.size;
      const foundPartCount = section.foundParts.size;
      const pricedPartCount = section.pricedParts.size;
      const missingPriceCount = Math.max(foundPartCount - pricedPartCount, 0);
      const state = stateForSection({ expectedPartCount, foundPartCount, pricedPartCount });
      return {
        sectionId: section.sectionId,
        sectionKey: section.sectionKey,
        sectionName: section.sectionName,
        source: section.source,
        sourceUrl: section.sourceUrl,
        diagramUrl: section.diagramUrl,
        imageUrl: section.imageUrl,
        sectionSeq: section.sectionSeq,
        sourceTables: Array.from(section.sourceTables),
        expectedPartCount,
        foundPartCount,
        pricedPartCount,
        missingPriceCount,
        state,
      };
    })
    .sort((a, b) => {
      const aSeq = typeof a.sectionSeq === "number" ? a.sectionSeq : 999999;
      const bSeq = typeof b.sectionSeq === "number" ? b.sectionSeq : 999999;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.sectionName.localeCompare(b.sectionName);
    });

  const trustedExpected = positiveNumber(applianceRows[0]?.trusted_total_part_count);
  const sectionSum = sections.reduce((sum, section) => sum + section.expectedPartCount, 0);
  const sourceBackedManifestCount = globalSourceBackedParts.size || sectionSum || null;
  const expectedTotalPartCount = trustedExpected || sourceBackedManifestCount;
  const expectedCountKind = trustedExpected
    ? "trusted_total_part_count"
    : sourceBackedManifestCount
      ? "source_backed_section_manifest"
      : "unknown";

  const foundTotalPartCount = globalSourceBackedParts.size;
  const pricedTotalPartCount = Array.from(globalSourceBackedParts).filter((partNumber) => pricedParts.has(partNumber)).length;

  return NextResponse.json({
    ok: true,
    model: inputModel,
    normalizedModel,
    applianceModels: applianceRows,
    expectedTotalPartCount,
    expectedCountKind,
    expectedCountSource: trustedExpected ? applianceRows[0]?.trusted_total_count_source || null : "section_manifest",
    expectedCountSourceUrl: trustedExpected ? applianceRows[0]?.trusted_total_count_source_url || null : sections[0]?.sourceUrl || null,
    foundTotalPartCount,
    pricedTotalPartCount,
    missingTotalPriceCount: Math.max(foundTotalPartCount - pricedTotalPartCount, 0),
    sectionCount: sections.length,
    sections,
    sourceCounts: {
      applianceModels: applianceRows.length,
      providerAssemblySections: providerSections.length,
      providerPartSeedRows: providerPartRows.length,
      bomRows: bomRows.length,
      pricingRows: pricingRows.length,
    },
    retrievalState: sections.length
      ? "section_manifest_found"
      : applianceRows.length
        ? "model_found_no_sections"
        : "not_found",
    nextAction: sections.length
      ? "process_sections_in_order_for_parts_and_pricing"
      : "retrieve_provider_diagram_sections_first",
    errors,
  });
}
