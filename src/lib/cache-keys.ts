/**
 * Deterministic cache key generation for Neon search caches.
 * Ensures the SAME search query always produces the SAME key regardless of source ordering.
 */

interface BuildModelSearchCacheKeyInput {
  normalizedModel: string;
  selectedSources: string[];
  searchMode: string;
}

/**
 * Builds a deterministic key for model search cache.
 * Uses: normalized model number, sorted sources, and search mode.
 */
export function buildModelSearchCacheKey({ 
  normalizedModel, 
  selectedSources, 
  searchMode 
}: BuildModelSearchCacheKeyInput): string {
  // selectedSources is already assumed to be sorted via normalize.ts
  const sourcePart = selectedSources.length > 0 ? selectedSources.join('|') : 'all';
  return `model:${normalizedModel}|sources:${sourcePart}|mode:${searchMode}`;
}

/**
 * Gets TTL configuration for different cache types.
 */
export function getCacheTTL() {
  return {
    parts: parseInt(process.env.CACHE_TTL_PARTS_HOURS || '720', 10), // Default 30 days
  };
}
