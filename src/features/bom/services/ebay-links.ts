export type BomPartNumberSource = {
  partNumber?: string | null;
  originalPartNumber?: string | null;
  currentServicePartNumber?: string | null;
};

export function cleanPartNumber(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function getBomRowPartNumber(row: BomPartNumberSource) {
  return (
    cleanPartNumber(row.currentServicePartNumber) ||
    cleanPartNumber(row.originalPartNumber) ||
    cleanPartNumber(row.partNumber)
  );
}

export function ebaySearchUrl(partNumber: string | null | undefined) {
  const query = cleanPartNumber(partNumber);
  return query
    ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`
    : "";
}

export function ebaySoldSearchUrl(partNumber: string | null | undefined) {
  const query = cleanPartNumber(partNumber);
  return query
    ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`
    : "";
}
