import type { BomRow } from "../schemas/bom";

function cleanPart(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return v.length ? v : null;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeModel(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function makeKey(row: BomRow) {
  const pn = normalizeModel(row.currentServicePartNumber || row.originalPartNumber);
  const section = (row.section || 'General').toLowerCase().trim();
  // Part number is the primary unique identifier; section is secondary
  return pn ? `pn:${pn}` : `sec:${section}:${normalizeModel(row.description)}`;
}

export function normalizeBomRows(rows: BomRow[]): BomRow[] {
  const map = new Map<string, BomRow>();

  for (const row of rows) {
    const normalized: BomRow = {
      ...row,
      section: cleanText(row.section),
      diagramNumber:
        typeof row.diagramNumber === "string"
          ? cleanText(row.diagramNumber)
          : row.diagramNumber,
      originalPartNumber: cleanPart(row.originalPartNumber),
      currentServicePartNumber: cleanPart(row.currentServicePartNumber),
      description: cleanText(row.description),
      sourceUrl: cleanText(row.sourceUrl),
      replacementNote: row.replacementNote ? cleanText(row.replacementNote) : null,
      confidence: Number.isFinite(row.confidence) ? row.confidence : 0.5,
    };

    const key = makeKey(normalized);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, normalized);
      continue;
    }

    map.set(key, {
      ...existing,
      originalPartNumber: existing.originalPartNumber ?? normalized.originalPartNumber,
      currentServicePartNumber:
        existing.currentServicePartNumber ?? normalized.currentServicePartNumber,
      nlaStatus: existing.nlaStatus || normalized.nlaStatus,
      confidence: Math.max(existing.confidence, normalized.confidence),
      replacementNote: existing.replacementNote ?? normalized.replacementNote ?? null,
    });
  }

  return [...map.values()].sort((a, b) => {
    const s = a.section.localeCompare(b.section);
    if (s !== 0) return s;

    const aNum = Number(a.diagramNumber);
    const bNum = Number(b.diagramNumber);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;

    return String(a.diagramNumber).localeCompare(String(b.diagramNumber));
  });
}
