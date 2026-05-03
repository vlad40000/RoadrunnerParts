/**
 * Utility for building Encompass URLs deterministically
 */

export function buildEncompassModelUrl(brandCode: string, modelNumber: string): string {
  // Example: https://encompass.com/model/WHI/WTW7500GC2
  const cleanBrand = brandCode.toUpperCase().trim();
  const cleanModel = modelNumber.toUpperCase().trim();
  return `https://encompass.com/model/${cleanBrand}/${cleanModel}`;
}

export function buildEncompassExplodedSearchUrl(brandCode: string, modelNumber: string): string {
  // Encompass exploded views are often sub-pages of the model page
  // This builds a search-grounded starting point
  const cleanBrand = brandCode.toUpperCase().trim();
  const cleanModel = modelNumber.toUpperCase().trim();
  return `https://encompass.com/search?searchTerm=${cleanModel}&brandCode=${cleanBrand}`;
}

export function validateEncompassUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "encompass.com" || 
      parsed.hostname.endsWith(".encompass.com")
    );
  } catch {
    return false;
  }
}
