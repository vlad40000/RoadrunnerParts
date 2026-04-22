import { sql } from '@/lib/db';

/**
 * Repository for model-first appliance parts persistence.
 */

export async function findModelInStore(normalizedModel) {
  try {
    const rows = await sql`
      SELECT 
        summary, 
        parts_json as parts, 
        sources_json as sources, 
        canonical_model,
        completeness_score,
        raw_row_count,
        master_row_count,
        section_count,
        truth_source,
        source_strategy,
        fallback_sources,
        provider_plan_json,
        conflict_flags,
        updated_at
      FROM appliance_parts_cache
      WHERE normalized_model = ${normalizedModel}
      LIMIT 1;
    `;

    if (rows.length === 0) return null;

    sql`
      UPDATE appliance_parts_cache
      SET last_used_at = NOW()
      WHERE normalized_model = ${normalizedModel};
    `.catch((e) => console.error('Last used update error', e));

    return {
      summary: rows[0].summary || '',
      parts: Array.isArray(rows[0].parts) ? rows[0].parts : [],
      sources: Array.isArray(rows[0].sources) ? rows[0].sources : [],
      canonicalModel: rows[0].canonical_model,
      truthSource: rows[0].truth_source || 'Manufacturer-first',
      sourceStrategy: rows[0].source_strategy || 'manufacturer-first',
      fallbackSources: rows[0].fallback_sources || [],
      providerPlan: rows[0].provider_plan_json || null,
      completeness: {
        score: rows[0].completeness_score || 0,
        rawRowCount: rows[0].raw_row_count || 0,
        masterRowCount: rows[0].master_row_count || 0,
        sectionCount: rows[0].section_count || 0,
        flags: rows[0].conflict_flags || [],
      },
      updatedAt: rows[0].updated_at,
    };
  } catch (error) {
    console.error('findModelInStore error', error);
    return null;
  }
}

export async function upsertModelToStore({
  normalizedModel,
  rawModel,
  payload,
}) {
  const {
    parts = [],
    summary = '',
    sources = [],
    canonicalModel = null,
    completeness = {},
    truthSource = 'Manufacturer-first',
    sourceStrategy = 'manufacturer-first',
    fallbackSources = [],
    providerPlan = null,
  } = payload;

  try {
    await sql`
      INSERT INTO appliance_parts_cache (
        normalized_model,
        raw_model,
        canonical_model,
        summary,
        parts_json,
        sources_json,
        completeness_score,
        raw_row_count,
        master_row_count,
        section_count,
        truth_source,
        source_strategy,
        fallback_sources,
        provider_plan_json,
        conflict_flags,
        updated_at,
        last_used_at
      )
      VALUES (
        ${normalizedModel},
        ${rawModel},
        ${canonicalModel},
        ${summary},
        ${JSON.stringify(parts)}::jsonb,
        ${JSON.stringify(sources)}::jsonb,
        ${completeness.score || 0},
        ${completeness.rawRowCount || 0},
        ${completeness.masterRowCount || 0},
        ${completeness.sectionCount || 0},
        ${truthSource},
        ${sourceStrategy},
        ${fallbackSources},
        ${providerPlan ? JSON.stringify(providerPlan) : null}::jsonb,
        ${JSON.stringify(completeness.flags || [])}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (normalized_model) DO UPDATE SET
        raw_model = EXCLUDED.raw_model,
        canonical_model = EXCLUDED.canonical_model,
        summary = EXCLUDED.summary,
        parts_json = EXCLUDED.parts_json,
        sources_json = EXCLUDED.sources_json,
        completeness_score = EXCLUDED.completeness_score,
        raw_row_count = EXCLUDED.raw_row_count,
        master_row_count = EXCLUDED.master_row_count,
        section_count = EXCLUDED.section_count,
        truth_source = EXCLUDED.truth_source,
        source_strategy = EXCLUDED.source_strategy,
        fallback_sources = EXCLUDED.fallback_sources,
        provider_plan_json = EXCLUDED.provider_plan_json,
        conflict_flags = EXCLUDED.conflict_flags,
        updated_at = NOW(),
        last_used_at = NOW();
    `;
  } catch (error) {
    console.error('upsertModelToStore error', error);
  }
}
