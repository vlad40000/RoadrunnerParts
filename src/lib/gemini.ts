import { runPartsExtractor } from "@/features/bom/agents/parts-extractor";

export async function extractPartsFromHtmlPage(
  html: string,
  input: { model: string; section?: string | null },
) {
  const result = await runPartsExtractor({
    sourceUrl: "",
    sourceType: "diagram",
    provider: "gemini-html-fallback",
    sourceText: html,
    modelNumber: input.model,
    applianceType: input.section || undefined,
  });

  return result.rows.map((row) => ({
    partNumber: row.currentServicePartNumber || row.originalPartNumber,
    description: row.description,
    diagramRef: row.diagramNumber,
    qty: 1,
    replacementNote: row.replacementNote,
    nlaStatus: row.nlaStatus,
  }));
}
