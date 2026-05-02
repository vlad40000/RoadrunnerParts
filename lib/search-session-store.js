import { sql } from './db';

const DEFAULT_TTL_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Creates a new search session in the database.
 */
export async function createSearchSession(payload = {}) {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_MS);
  
  const requestJson = {
    modelNumber: payload.modelNumber,
    serialNumber: payload.serialNumber || '',
    brand: payload.brand || null,
    productType: payload.productType || null,
    exhaustiveMode: Boolean(payload.exhaustiveMode),
  };

  await sql`
    INSERT INTO search_sessions (
      id, created_at, updated_at, expires_at, request_json, 
      stage, has_more, next_stage, status, canonical_model, cache_status,
      identity_json, route_json, variant_json, review_json
    )
    VALUES (
      ${id}, ${now}, ${now}, ${expiresAt}, ${JSON.stringify(requestJson)}::jsonb,
      'init', true, 'manufacturer', 'partial', ${payload.canonicalModel || null}, 'live',
      ${payload.identity ? JSON.stringify(payload.identity) : null}::jsonb,
      ${payload.route ? JSON.stringify(payload.route) : null}::jsonb,
      ${payload.variant ? JSON.stringify(payload.variant) : null}::jsonb,
      ${payload.review ? JSON.stringify(payload.review) : null}::jsonb
    );
  `;

  return {
    id,
    request: requestJson,
    stage: 'init',
    hasMore: true,
    nextStage: 'manufacturer',
    status: 'partial',
    canonicalModel: payload.canonicalModel || null,
    cacheStatus: 'live',
    identity: payload.identity || null,
    route: payload.route || null,
    variant: payload.variant || null,
    review: payload.review || null,
    accumulatedRawParts: [],
    accumulatedSources: [],
    retrievalTrace: {
      manufacturerAttempted: false,
      primaryFallbackAttempted: false,
      secondaryFallbackAttempted: false,
    }
  };
}

/**
 * Retrieves a session from the database. Refreshes expiry on access.
 */
export async function getSearchSession(sessionId) {
  try {
    const rows = await sql`
      SELECT * FROM search_sessions 
      WHERE id = ${sessionId} AND expires_at > NOW();
    `;

    if (rows.length === 0) return null;
    const row = rows[0];

    // Refresh expiry
    const newExpiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
    await sql`
      UPDATE search_sessions 
      SET updated_at = NOW(), expires_at = ${newExpiresAt}
      WHERE id = ${sessionId};
    `;

    return {
      id: row.id,
      request: row.request_json,
      stage: row.stage,
      hasMore: row.has_more,
      nextStage: row.next_stage,
      status: row.status,
      canonicalModel: row.canonical_model,
      serialProfile: row.serial_profile_json,
      retrievalTrace: row.retrieval_trace_json || {
        manufacturerAttempted: false,
        primaryFallbackAttempted: false,
        secondaryFallbackAttempted: false,
      },
      accumulatedRawParts: row.accumulated_raw_parts_json || [],
      accumulatedSources: row.accumulated_sources_json || [],
      lastPayload: row.last_payload_json,
      cacheStatus: row.cache_status || 'live',
      identity: row.identity_json,
      route: row.route_json,
      variant: row.variant_json,
      review: row.review_json
    };
  } catch (err) {
    console.error('getSearchSession error', err);
    return null;
  }
}

/**
 * Updates a session in the database.
 */
export async function updateSearchSession(sessionId, patch = {}) {
  const updates = [];
  
  if (patch.stage !== undefined) updates.push(sql`stage = ${patch.stage}`);
  if (patch.hasMore !== undefined) updates.push(sql`has_more = ${patch.has_more}`);
  if (patch.nextStage !== undefined) updates.push(sql`next_stage = ${patch.next_stage}`);
  if (patch.status !== undefined) updates.push(sql`status = ${patch.status}`);
  if (patch.canonicalModel !== undefined) updates.push(sql`canonical_model = ${patch.canonicalModel}`);
  if (patch.serialProfile !== undefined) updates.push(sql`serial_profile_json = ${JSON.stringify(patch.serialProfile)}::jsonb`);
  if (patch.retrievalTrace !== undefined) updates.push(sql`retrieval_trace_json = ${JSON.stringify(patch.retrievalTrace)}::jsonb`);
  if (patch.accumulatedRawParts !== undefined) updates.push(sql`accumulated_raw_parts_json = ${JSON.stringify(patch.accumulatedRawParts)}::jsonb`);
  if (patch.accumulatedSources !== undefined) updates.push(sql`accumulated_sources_json = ${JSON.stringify(patch.accumulatedSources)}::jsonb`);
  if (patch.lastPayload !== undefined) updates.push(sql`last_payload_json = ${JSON.stringify(patch.lastPayload)}::jsonb`);
  if (patch.cacheStatus !== undefined) updates.push(sql`cache_status = ${patch.cacheStatus}`);
  if (patch.identity !== undefined) updates.push(sql`identity_json = ${JSON.stringify(patch.identity)}::jsonb`);
  if (patch.route !== undefined) updates.push(sql`route_json = ${JSON.stringify(patch.route)}::jsonb`);
  if (patch.variant !== undefined) updates.push(sql`variant_json = ${JSON.stringify(patch.variant)}::jsonb`);
  if (patch.review !== undefined) updates.push(sql`review_json = ${JSON.stringify(patch.review)}::jsonb`);

  if (updates.length === 0) return;

  const newExpiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
  
  try {
    // Manual construction since @neondatabase/serverless template literal is strict
    // We'll update the most critical fields
    await sql`
      UPDATE search_sessions
      SET 
        updated_at = NOW(),
        expires_at = ${newExpiresAt},
        stage = COALESCE(${patch.stage ?? null}, stage),
        has_more = COALESCE(${patch.hasMore ?? null}, has_more),
        next_stage = ${patch.nextStage ?? null},
        status = COALESCE(${patch.status ?? null}, status),
        canonical_model = COALESCE(${patch.canonicalModel ?? null}, canonical_model),
        serial_profile_json = COALESCE(${patch.serialProfile ? JSON.stringify(patch.serialProfile) : null}::jsonb, serial_profile_json),
        retrieval_trace_json = COALESCE(${patch.retrievalTrace ? JSON.stringify(patch.retrievalTrace) : null}::jsonb, retrieval_trace_json),
        accumulated_raw_parts_json = COALESCE(${patch.accumulatedRawParts ? JSON.stringify(patch.accumulatedRawParts) : null}::jsonb, accumulated_raw_parts_json),
        accumulated_sources_json = COALESCE(${patch.accumulatedSources ? JSON.stringify(patch.accumulatedSources) : null}::jsonb, accumulated_sources_json),
        last_payload_json = COALESCE(${patch.lastPayload ? JSON.stringify(patch.lastPayload) : null}::jsonb, last_payload_json),
        cache_status = COALESCE(${patch.cacheStatus ?? null}, cache_status),
        identity_json = COALESCE(${patch.identity ? JSON.stringify(patch.identity) : null}::jsonb, identity_json),
        route_json = COALESCE(${patch.route ? JSON.stringify(patch.route) : null}::jsonb, route_json),
        variant_json = COALESCE(${patch.variant ? JSON.stringify(patch.variant) : null}::jsonb, variant_json),
        review_json = COALESCE(${patch.review ? JSON.stringify(patch.review) : null}::jsonb, review_json)
      WHERE id = ${sessionId};
    `;
  } catch (err) {
    console.error('updateSearchSession error', err);
  }
}

/**
 * Deletes a session.
 */
export async function deleteSearchSession(sessionId) {
  try {
    await sql`DELETE FROM search_sessions WHERE id = ${sessionId};`;
  } catch (err) {
    console.error('deleteSearchSession error', err);
  }
}

/**
 * Prunes expired sessions from the database.
 */
export async function pruneExpiredSessions() {
  try {
    const result = await sql`DELETE FROM search_sessions WHERE expires_at <= NOW();`;
    console.log(`[SessionStore] Pruned expired sessions.`);
  } catch (err) {
    console.error('pruneExpiredSessions error', err);
  }
}
