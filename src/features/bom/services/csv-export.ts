import type { BomRow } from "../schemas/bom";
import { ebaySearchUrl, ebaySoldSearchUrl, getBomRowPartNumber } from "./ebay-links";

export function bomRowsToCsv(rows: BomRow[]) {
  const headers = [
    "Section",
    "Diagram Number",
    "Original Part Number",
    "Current Service Part Number",
    "eBay Active Search URL",
    "eBay Sold Search URL",
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
    ...rows.map((row) => {
      const partNumber = getBomRowPartNumber(row);

      return [
        row.section,
        row.diagramNumber,
        row.originalPartNumber ?? "",
        row.currentServicePartNumber ?? "",
        ebaySearchUrl(partNumber),
        ebaySoldSearchUrl(partNumber),
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
        .join(",");
    }),
  ];

  return lines.join("\n");
}
