/**
 * Normalizes an appliance model number for consistent DB indexing and retrieval.
 */
export function normalizeModelNumber(model: string): string {
  if (!model) return "";
  
  return model
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""); // Remove dashes, dots, spaces
}
