/**
 * Normalizes an appliance model number for consistent cache keys.
 * Rules: trim, toUpperCase, remove all internal whitespace.
 * Example: " RF28R 7351SR " -> "RF28R7351SR"
 */
export function normalizeModelNumber(modelNumber: string | null | undefined): string {
  if (!modelNumber || typeof modelNumber !== 'string') return '';
  return modelNumber.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Normalizes a part number for consistent lookups.
 */
export function normalizePartNumber(partNumber: string | null | undefined): string {
  if (!partNumber || typeof partNumber !== 'string') return '';
  return partNumber.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Normalizes the list of selected source IDs.
 */
export function normalizeSelectedSources(selectedSources: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(selectedSources)) return [];
  const normalized = selectedSources
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase());
  
  return [...new Set(normalized)].sort();
}
