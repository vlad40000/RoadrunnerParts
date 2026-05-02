/**
 * Worker 7: BOM Merger
 * Consolidates raw part rows, dedupes, and calculates completeness.
 */

import { normalizePartNumber } from './normalize';

/**
 * Merges raw rows into a unified master parts list.
 */
export function mergeBOM(rawRows) {
  const masterPartsMap = new Map();
  
  // 1. Group by normalized part number
  for (const row of rawRows) {
    const normPN = normalizePartNumber(row.rawPartNumber);
    if (!normPN) continue;

    if (!masterPartsMap.has(normPN)) {
      masterPartsMap.set(normPN, {
        partNumber: row.rawPartNumber,
        name: row.rawPartName,
        category: row.rawCategory || 'General',
        section: row.sectionName,
        quantity: row.quantity || 1,
        diagramRef: row.diagramRef,
        sources: new Set([row.source]),
        rawRows: []
      });
    }

    const entry = masterPartsMap.get(normPN);
    entry.sources.add(row.source);
    entry.rawRows.push(row);
    
    // Update name/category if the new row has better info (longer name etc)
    if (row.rawPartName && row.rawPartName.length > entry.name.length) {
      entry.name = row.rawPartName;
    }
  }

  const masterParts = Array.from(masterPartsMap.values()).map(p => ({
    ...p,
    sources: Array.from(p.sources)
  }));

  // 2. Calculate Completeness Score
  const score = calculateCompletenessScore(masterParts, rawRows);

  return {
    masterParts,
    completeness: {
      score,
      rawRowCount: rawRows.length,
      masterRowCount: masterParts.length,
      sectionCount: new Set(rawRows.map(r => r.sectionName)).size
    }
  };
}

function calculateCompletenessScore(masterParts, rawRows) {
  if (rawRows.length === 0) return 0;
  
  // Logic: 
  // - High score if we have common critical parts (motor, control board, etc)
  // - High score if parts are distributed across multiple sections
  // - Penalty if all parts are in "General"
  
  const sections = new Set(rawRows.map(r => r.sectionName));
  const hasCritical = masterParts.some(p => 
    /motor|board|timer|valve|pump|element|heating/i.test(p.name)
  );

  let baseScore = 40;
  if (sections.size > 2) baseScore += 20;
  if (sections.size > 5) baseScore += 20;
  if (hasCritical) baseScore += 10;
  if (masterParts.length > 20) baseScore += 10;

  return Math.min(100, baseScore);
}
