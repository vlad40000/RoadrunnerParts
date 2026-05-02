import { LRUCache } from 'lru-cache';

/**
 * In-memory LRU cache to intercept database calls for frequently accessed searches.
 * This makes "repeat" hits actually sub-10ms by avoiding a Neon round-trip entirely.
 */
const MEM_CACHE = new LRUCache<string, any>({
  max: 500, // Store up to 500 search results
  ttl: 1000 * 60 * 15, // 15-minute TTL in memory before falling back to Neon
});

export const memoryCache = {
  get: (key: string) => MEM_CACHE.get(key),
  set: (key: string, value: any) => MEM_CACHE.set(key, value),
  delete: (key: string) => MEM_CACHE.delete(key),
};
