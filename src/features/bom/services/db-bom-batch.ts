import 'server-only';

import { sql } from '../../../server/db';

type DbBomRow = {
  source_table: string;
  source_provider: string | null;
  part_number: string | null;
  description: string | null;
  section: string | null;
  diagram_number: string | null;
  source_url: string | null;
  provider_assembly_url: string | null;
  diagram_url: string | null;
  source_status: string | null;
  source_file: string | null;
  source_row: number | null;
  priority: number;
};

export type DbBomBatchResult = {
  parts: Array<Record<string, any>>;
  source: 'db_source_backed_batch' | 'none';
  retrievalState: 'bom_complete' | 'parts_partial' | 'no_db_rows';
  totalSourceBackedParts: number;
  returnedPartCount: number;
  remainingPartCount: number;
  excludedPartCount: number;
};

function normalizeModel(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function normalizePartNumber(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function cleanText(value: unknown) {
  return String(value || '').trim();
}

function uniqueRowsByPartNumber(rows: DbBomRow[]) {
  const seen = new Set<string>();
  const unique: DbBomRow[] = [];

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.part_number);
    if (!partNumber || seen.has(partNumber)) continue;
    seen.add(partNumber);
    unique.push(row);
  }

  return unique;
}

export async function findNextDbBomBatch(input: {
  model: string;
  excludePartNumbers?: unknown[];
  limit?: number;
}): Promise<DbBomBatchResult> {
  const normalizedModel = normalizeModel(input.model);
  const limit = Math.max(1, Math.min(100, Number(input.limit || 40)));
  const excluded = new Set((input.excludePartNumbers || []).map(normalizePartNumber).filter(Boolean));

  if (!normalizedModel) {
    return {
      parts: [],
      source: 'none',
      retrievalState: 'no_db_rows',
      totalSourceBackedParts: 0,
      returnedPartCount: 0,
      remainingPartCount: 0,
      excludedPartCount: excluded.size,
    };
  }

  const rows = (await sql`
    with provider_rows as (
      select
        'provider_part_seed_rows'::text as source_table,
        provider as source_provider,
        coalesce(current_service_part_number, original_part_number) as part_number,
        description,
        coalesce(section_name_clean, section_label_raw, normalized_section) as section,
        diagram_number,
        coalesce(provider_assembly_url, provider_model_url, diagram_url) as source_url,
        provider_assembly_url,
        diagram_url,
        source_status,
        source_file,
        source_row,
        1 as priority
      from provider_part_seed_rows
      where upper(regexp_replace(model, '[^A-Z0-9]', '', 'g')) = ${normalizedModel}
        and coalesce(current_service_part_number, original_part_number) is not null
        and coalesce(current_service_part_number, original_part_number) <> ''
    ),
    retrieval_rows as (
      select
        'bom_parts'::text as source_table,
        bp.source as source_provider,
        bp.part_number,
        bp.description,
        ba.assembly_name as section,
        bp.diagram_ref as diagram_number,
        coalesce(bp.source_url, ba.assembly_url, ba.diagram_url) as source_url,
        ba.assembly_url as provider_assembly_url,
        ba.diagram_url,
        null::text as source_status,
        null::text as source_file,
        null::integer as source_row,
        2 as priority
      from bom_parts bp
      join appliance_models am on am.id = bp.model_id
      left join bom_assemblies ba on ba.id = bp.assembly_id
      where am.normalized_model = ${normalizedModel}
        and bp.part_number is not null
        and bp.part_number <> ''
    )
    select *
    from (
      select * from provider_rows
      union all
      select * from retrieval_rows
    ) combined
    order by priority asc, section nulls last, diagram_number nulls last, part_number asc
  `) as DbBomRow[];

  const uniqueRows = uniqueRowsByPartNumber(rows);
  const availableRows = uniqueRows.filter((row) => !excluded.has(normalizePartNumber(row.part_number)));
  const selectedRows = availableRows.slice(0, limit);

  const parts = selectedRows.map((row, index) => {
    const partNumber = normalizePartNumber(row.part_number);
    const section = cleanText(row.section);
    const sourceUrl = cleanText(row.source_url || row.provider_assembly_url || row.diagram_url);

    return {
      id: index + 1,
      partNumber,
      description: cleanText(row.description) || partNumber,
      section,
      compatibleModels: [input.model],
      diagramNumber: cleanText(row.diagram_number) || null,
      sourceProvider: cleanText(row.source_provider) || 'db',
      sourceUrl: sourceUrl || null,
      providerAssemblyUrl: cleanText(row.provider_assembly_url) || null,
      diagramUrl: cleanText(row.diagram_url) || null,
      sourceStatus: cleanText(row.source_status) || null,
      sourceFile: cleanText(row.source_file) || null,
      sourceRow: row.source_row ?? null,
      sourceTable: row.source_table,
      sourceEvidence: 'db_source_backed_bom_row',
      sourceBacked: true,
      price: null,
      priceSource: 'supplier_price_required',
      priceVerified: false,
      pricingRequired: true,
    };
  });

  const remainingPartCount = Math.max(0, availableRows.length - selectedRows.length);

  return {
    parts,
    source: parts.length > 0 ? 'db_source_backed_batch' : 'none',
    retrievalState: uniqueRows.length === 0
      ? 'no_db_rows'
      : remainingPartCount === 0
        ? 'bom_complete'
        : 'parts_partial',
    totalSourceBackedParts: uniqueRows.length,
    returnedPartCount: parts.length,
    remainingPartCount,
    excludedPartCount: excluded.size,
  };
}
