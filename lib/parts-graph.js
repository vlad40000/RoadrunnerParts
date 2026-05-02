import { sql } from '@/lib/db';

/**
 * Layer 5 — Parts Graph Query Interface
 *
 * Reads the reconciled model_parts_master and produces
 * the optimized app payload that gets cached in appliance_parts_cache.
 */

/**
 * Get the full master parts graph for a canonical model.
 */
export async function getMasterPartsForModel(canonicalModel) {
  const model = String(canonicalModel).trim().toUpperCase();
  try {
    const rows = await sql`
      SELECT
        canonical_part_number,
        canonical_part_name,
        normalized_section,
        normalized_category,
        preferred_source,
        substitute_chain,
        serial_applicability,
        source_confidence,
        conflict_flags,
        provider_rows
      FROM model_parts_master
      WHERE canonical_model = ${model}
      ORDER BY normalized_section, canonical_part_name;
    `;
    return rows;
  } catch (err) {
    console.error('getMasterPartsForModel error', err);
    return [];
  }
}

/**
 * Build the optimized app response from master parts.
 *
 * This is what gets stored in appliance_parts_cache and
 * returned to the UI.
 *
 * @param {string} canonicalModel
 * @param {Array} masterParts - rows from model_parts_master or reconcileParts output
 * @param {object} opts - { summary, brand, completenessScore, rawRowCount, sectionCount }
 * @returns {object} - { summary, parts, sources, completenessScore, completeness: { ... } }
 */
export function buildOptimizedResponse(canonicalModel, masterParts, opts = {}) {
  const parts = masterParts.map((mp) => {
    const providerRows = mp.providerRows || mp.provider_rows || [];
    const firstRow = providerRows[0] || {};

    return {
      name: mp.canonicalPartName || mp.canonical_part_name || '',
      partNumber: mp.canonicalPartNumber || mp.canonical_part_number || '',
      source: firstRow.source || 'Aggregated', // source of the first row
      category: mp.normalizedCategory || mp.normalized_category || 'General',
      section: mp.normalizedSection || mp.normalized_section || 'General',
      substitutes: mp.substituteChain || mp.substitute_chain || [],
      quantity: firstRow.quantity || null,
      diagramRef: firstRow.diagram_ref || firstRow.diagramRef || null,
      serialApplicability: mp.serialApplicability || mp.serial_applicability || [],
      providerRows,
      sourceConfidence: mp.sourceConfidence || mp.source_confidence || {},
      hasConflicts: (mp.conflictFlags || mp.conflict_flags || []).length > 0,
    };
  });

  // Collect unique sources
  const sourceSet = new Set();
  for (const p of parts) {
    if (p.source) sourceSet.add(p.source);
  }

  const sources = [...sourceSet].map((s) => ({
    title: s,
    uri: s.startsWith('http') ? s : `https://${s}`,
  }));

  const completeness = {
    sectionCount: opts.sectionCount || 0,
    rawRowCount: opts.rawRowCount || 0,
    masterRowCount: parts.length,
    score: opts.completenessScore || 0,
    flags: opts.conflictFlags || [],
  };

  return {
    summary: opts.summary || `OEM BOM for ${canonicalModel} (${parts.length} master parts).`,
    parts,
    sources,
    source: opts.truthSource || 'unknown',
    truthSource: opts.truthSource || 'Manufacturer-first',
    sourceStrategy: opts.sourceStrategy || 'manufacturer-first',
    fallbackSources: opts.fallbackSources || [],
    completeness,
    canonicalModel,
  };
}
