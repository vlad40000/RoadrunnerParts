import type { BomRow } from "../schemas/bom";

export function hasRequiredFields(row: BomRow) {
  return !!(
    row.section &&
    row.diagramNumber !== null &&
    row.diagramNumber !== undefined &&
    row.description &&
    (row.currentServicePartNumber || row.originalPartNumber)
  );
}

export function filterInvalidRows(rows: BomRow[]) {
  return rows.filter(hasRequiredFields);
}

export function rejectHallucinatedRows(rows: BomRow[]) {
  return rows.filter((row) => {
    // If we have very low confidence from the AI extractor, reject
    if (row.confidence < 0.5) return false;
    if (!row.sourceUrl) return false;
    return true;
  });
}
