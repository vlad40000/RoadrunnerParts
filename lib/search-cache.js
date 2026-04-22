import { sql } from '@/lib/db';
import { getCacheTTLHours } from '@/lib/cache-keys';

/**
 * Reads a fresh model search result from Neon.
 * If found and not expired, increments hit count and returns the result.
 */
export async function findModelSearchInCache(cacheKey) {
  try {
    const rows = await sql`
      SELECT summary, parts, sources, expires_at
      FROM model_search_cache
      WHERE cache_key = ${cacheKey}
      LIMIT 1;
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    if (now > expiresAt) {
      return { data: row, isStale: true };
    }

    // Update hit stats async
    sql`
      UPDATE model_search_cache
      SET hit_count = hit_count + 1,
          last_hit_at = NOW()
      WHERE cache_key = ${cacheKey};
    `.catch(e => console.error('Hit stats update error', e));

    return { data: row, isStale: false };
  } catch (error) {
    console.error('findModelSearchInCache error', error);
    return null;
  }
}

/**
 * Upserts a fresh model search result into Neon.
 */
export async function upsertModelSearchCache({
  cacheKey,
  normalizedModel,
  rawModel,
  selectedSources,
  searchMode,
  payload
}) {
  const { parts, summary, sources } = payload;
  const ttlHours = getCacheTTLHours().parts;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    await sql`
      INSERT INTO model_search_cache (
        cache_key, normalized_model, raw_model, 
        selected_sources, search_mode, summary, 
        parts, sources, source_count, expires_at,
        refreshed_at, updated_at
      )
      VALUES (
        ${cacheKey}, ${normalizedModel}, ${rawModel}, 
        ${selectedSources}, ${searchMode}, ${summary}, 
        ${parts}, ${sources}, ${sources.length || 0}, ${expiresAt.toISOString()},
        NOW(), NOW()
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        summary = EXCLUDED.summary,
        parts = EXCLUDED.parts,
        sources = EXCLUDED.sources,
        source_count = EXCLUDED.source_count,
        expires_at = EXCLUDED.expires_at,
        refreshed_at = NOW(),
        updated_at = NOW(),
        status = 'ready';
    `;
  } catch (error) {
    console.error('upsertModelSearchCache error', error);
  }
}
