import type { BomRow, DiagramParse } from "../schemas/bom";

export function computeUnmatchedCallouts(
  diagramData: DiagramParse,
  rows: BomRow[],
) {
  const seen = new Set(
    rows.map((r) => String(r.diagramNumber).trim().toUpperCase()),
  );

  const unmatched: Array<number | string> = [];

  for (const section of diagramData.sections) {
    for (const callout of section.callouts) {
      const key = String(callout).trim().toUpperCase();
      if (!seen.has(key)) unmatched.push(callout);
    }
  }

  return unmatched;
}

export function coverageScore(input: {
  rows: BomRow[];
  sectionsFound: string[];
  unmatchedCallouts: Array<number | string>;
  minimumUniqueParts?: number;
}) {
  const minimumUniqueParts = input.minimumUniqueParts ?? 40;

  const partScore = Math.min(input.rows.length / minimumUniqueParts, 1);
  const sectionScore = Math.min(input.sectionsFound.length / 4, 1);

  const totalCallouts =
    input.rows.length + input.unmatchedCallouts.length || 1;
  const calloutScore = 1 - input.unmatchedCallouts.length / totalCallouts;

  return Number(((partScore * 0.45) + (sectionScore * 0.2) + (calloutScore * 0.35)).toFixed(3));
}
