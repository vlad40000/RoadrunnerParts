# Workflow State - BOM Pipeline Hardening

## Progress Summary
- [x] **Data Sanitization**: Purged corrupted `model_parts_cache` entries.
- [x] **Strict Validation**: Implemented regex-based domain whitelist for price sources.
- [x] **Single-Provider Strategy**: Consolidated all distributor and retail pricing to **Encompass**.
- [x] **Direct Path (New Path)**: Implemented direct URL construction (`/model/[CODE]/[MODEL]`) and assembly processing for Encompass.
- [x] **Universal Encompass Routing**: Re-routed major brands (Whirlpool, LG, etc.) through the universal Encompass provider.
- [x] **Deterministic Orchestration**: Simplified pipeline to prioritize Encompass authoritative data.
- [x] **Identity-First UI**: Implemented `EncompassUrlPanel` for direct OEM source routing via model/serial identity.
- [x] **Brand-to-Code Mapping**: Consolidated all brand-specific URL routes into `lib/encompass-routes.ts`.

## Current Architecture
1. **Cache Hit**: Returns normalized data instantly.
2. **Direct Path (New Path)**: Attempts direct URL fetch on Encompass using brand-normalized codes.
3. **Deterministic Search**: Fallback to search-based orchestration for authoritative brand data.
4. **Pricing Enrichment**: Results are enriched with verified retail prices via direct item path or search.
5. **AI Fallback**: Gemini is invoked only if stage 2-4 yield no valid parts.

## Pending Tasks
- [ ] **Telemetry & Monitoring**: Implement automated alerts for suspicious extraction patterns or high fallback rates.
- [ ] **Source Parser Expansion**: Refine `parseStructuredSourceText` to handle more complex provider outputs.
- [ ] **Proxy Integration**: Add residential proxies to `SourceFetcher` if deterministic scrapers get blocked.

## Blockers
- None currently.
