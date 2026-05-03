import type { BomRow } from "../schemas/bom";

export function bomRowsToCsv(rows: BomRow[]) {
  const headers = [
    "Section",
    "Diagram Number",
    "Original Part Number",
    "Current Service Part Number",
    "Description",
    "NLA Status",
    "Retail Price",
    "Retail Price Text",
    "Retail Availability",
    "Retail Pricing URL",
    "Retail Price Source",
    "Retail Price Verified",
    "Retail Priced At",
    "Source URL",
    "Source Type",
    "Confidence",
    "Replacement Note",
  ];

  const escape = (value: unknown) => {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.section,
        row.diagramNumber,
        row.originalPartNumber ?? "",
        row.currentServicePartNumber ?? "",
        row.description,
        row.nlaStatus ? "Yes" : "No",
        row.retailPrice ?? "",
        row.retailPriceText ?? "",
        row.retailAvailability ?? "",
        row.retailPricingUrl ?? "",
        row.retailPriceSource ?? "",
        row.retailPriceVerified ? "Yes" : "No",
        row.retailPricedAt ?? "",
        row.sourceUrl,
        row.sourceType,
        row.confidence,
        row.replacementNote ?? "",
      ]
        .map(escape)
        .join(","),
    ),
  ];

  return lines.join("\n");
}
