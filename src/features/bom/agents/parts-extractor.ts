import { z } from "zod";
import { bomRowSchema, type BomRow } from "../schemas/bom";
import { buildPartsPrompt } from "../prompts/parts";
import { runStructuredJson } from "../services/model-runner";

const partsResultSchema = z.object({
  rows: z.array(bomRowSchema),
});

function isExplicitNoRowsSource(sourceText: string) {
  const normalized = sourceText.toUpperCase();
  return (
    normalized.includes("ADAPTER_STATUS: NOT_IMPLEMENTED") ||
    normalized.includes("NO_PART_ROWS: TRUE")
  );
}

function parseStructuredRows(sourceText: string, sourceUrl: string): BomRow[] {
  const lines = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionLine = lines.find((line) => line.startsWith("SECTION: "));
  const section = sectionLine?.replace(/^SECTION:\s*/, "").trim() ?? "UNKNOWN";

  const rowLines = lines.filter((line) => line.startsWith("ROW|"));

  if (!rowLines.length) return [];

  return rowLines.map((line) => {
    const parts = line.split("|").slice(1);
    const kv = Object.fromEntries(
      parts.map((part) => {
        const idx = part.indexOf("=");
        if (idx === -1) return [part, ""];
        return [part.slice(0, idx), part.slice(idx + 1)];
      }),
    );

    const rawDiagramNumber = kv.diagram_number || "";

    return {
      section,
      diagramNumber: /^\d+$/.test(rawDiagramNumber)
        ? Number(rawDiagramNumber)
        : rawDiagramNumber,
      originalPartNumber: kv.original_part_number || null,
      currentServicePartNumber: kv.current_service_part_number || null,
      description: kv.description || "",
      nlaStatus: kv.nla_status === "true",
      sourceUrl,
      sourceType: "oem" as const,
      replacementNote: kv.replacement_note || null,
      confidence: 0.99,
    };
  });
}

export async function runPartsExtractor(input: {
  sourceText: string;
  sourceUrl: string;
  sourceType: "oem" | "distributor" | "manual" | "diagram" | "fallback";
  assemblyName?: string;
}): Promise<BomRow[]> {
  const deterministic = parseStructuredRows(input.sourceText, input.sourceUrl);

  if (deterministic.length > 0) {
    return deterministic.map((row) => bomRowSchema.parse(row));
  }

  if (isExplicitNoRowsSource(input.sourceText)) {
    return [];
  }

  const raw = await runStructuredJson<{ rows: BomRow[] }>({
    prompt: buildPartsPrompt(input.assemblyName),
    text: JSON.stringify({
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType,
      content: input.sourceText,
    }),
  });

  return partsResultSchema.parse(raw).rows.map((row) => ({
    ...row,
    sourceUrl: row.sourceUrl || input.sourceUrl,
    sourceType: row.sourceType || input.sourceType,
  }));
}
