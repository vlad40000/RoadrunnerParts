function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function partNumber(row: any): string {
  return clean(
    row.currentServicePartNumber ||
      row.current_service_part_number ||
      row.originalPartNumber ||
      row.original_part_number ||
      row.partNumber ||
      row.part_number ||
      row.raw_part_number,
  ).toUpperCase();
}

export async function reconcileParts(
  model: string,
  rows: any[],
  options: { expectedTotal?: number | null; persist?: boolean } = {},
) {
  const byPartNumber = new Map<string, any>();

  for (const row of Array.isArray(rows) ? rows : []) {
    const number = partNumber(row);
    if (!number) continue;

    const raw = row.raw_payload || row;
    byPartNumber.set(number, {
      section: clean(row.section || row.section_name || row.raw_category || raw.section || raw.diagram_group) || "Uncategorized",
      diagramNumber: clean(row.diagramNumber || row.diagram_number || row.diagram_ref || raw.diagram_ref),
      originalPartNumber: clean(row.originalPartNumber || row.original_part_number || row.raw_part_number || number) || number,
      currentServicePartNumber: clean(row.currentServicePartNumber || row.current_service_part_number || number) || number,
      description: clean(row.description || row.raw_part_name || raw.description || raw.name) || "Appliance Part",
      nlaStatus: Boolean(row.nlaStatus || row.nla_status || raw.nla_status),
      sourceUrl: clean(row.sourceUrl || row.source_url || raw.source_url),
      sourceType: row.sourceType || row.source_type || "diagram",
      imageUrl: raw.image_url || row.imageUrl || null,
      replacementNote: raw.replacement_note || row.replacementNote || null,
      confidence: typeof row.confidence === "number" ? row.confidence : 0.95,
    });
  }

  const masterParts = [...byPartNumber.values()];
  const expectedTotal = Number(options.expectedTotal || 0);
  const completenessScore = expectedTotal > 0
    ? Math.min(100, (masterParts.length / expectedTotal) * 100)
    : Math.min(100, masterParts.length >= 40 ? 100 : (masterParts.length / 40) * 100);

  return {
    model,
    masterParts,
    completenessScore,
    sectionCount: new Set(masterParts.map((part) => part.section)).size,
  };
}
