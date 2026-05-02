/**
 * Deterministic cache key generation for Neon search caches.
 * Ensures the SAME search query sempre produces the SAME key regardless of source ordering.
 */

/**
 * Builds a deterministic key for model search cache.
 * Uses: normalized model number, sorted sources, and search mode.
 */
export function buildModelSearchCacheKey({ normalizedModel, selectedSources, searchMode }) {
  // selectedSources is already assumed to be sorted via normalize.js
  const sourcePart = selectedSources.length > 0 ? selectedSources.join('|') : 'all';
  return `model:${normalizedModel}|sources:${sourcePart}|mode:${searchMode}`;
}


/**
 * Gets TTL in hours from environment variables or safe defaults.
 */
  return {
    parts: parseInt(process.env.CACHE_TTL_PARTS_HOURS || '720', 10), // Default 30 days
  };
