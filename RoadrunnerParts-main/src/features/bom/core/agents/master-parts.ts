import { type BomRow } from "../../schemas/bom";

export type MasterPart = BomRow & {
  sources: string[];
  confidence: number;
};

export function mergeMasterParts(
  existing: MasterPart[],
  newRows: BomRow[],
  sourceName: string
): MasterPart[] {
  const masterMap = new Map<string, MasterPart>();

  // Initialize with existing
  for (const p of existing) {
    const key = makeKey(p);
    masterMap.set(key, p);
  }

  // Merge new
  for (const row of newRows) {
    const key = makeKey(row);
    const existingPart = masterMap.get(key);

    if (existingPart) {
      // Update existing
      if (!existingPart.sources.includes(sourceName)) {
        existingPart.sources.push(sourceName);
      }
      // Keep highest confidence or most descriptive name if OEM
      if (sourceName === 'oem' || row.confidence > existingPart.confidence) {
        existingPart.description = row.description;
        existingPart.confidence = Math.max(existingPart.confidence, row.confidence);
      }
      // Merge replacement notes
      if (row.replacementNote && !existingPart.replacementNote?.includes(row.replacementNote)) {
        existingPart.replacementNote = existingPart.replacementNote 
          ? `${existingPart.replacementNote}; ${row.replacementNote}`
          : row.replacementNote;
      }
    } else {
      masterMap.set(key, {
        ...row,
        sources: [sourceName],
        confidence: row.confidence || 0.8,
      });
    }
  }

  return [...masterMap.values()];
}

function makeKey(row: BomRow) {
  const pn = (row.currentServicePartNumber || row.originalPartNumber || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const section = (row.section || "GENERAL")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const diag = String(row.diagramNumber || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  // If we have a part number, the key is PN + Section + DiagramNumber
  // If no PN, use description + Section + DiagramNumber
  const base = pn ? `pn:${pn}` : `desc:${(row.description || "").replace(/[^a-z0-9]/gi, "").toUpperCase()}`;
  return `${section}:${diag}:${base}`;
}
