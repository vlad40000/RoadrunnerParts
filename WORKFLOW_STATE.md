# RoadrunnerParts — Encompass Hardening Workflow

## Status: Phase 2 Hardened Retrieval COMPLETE
- [x] **DB-Driven Routing**: `encompass_brand_routes` table is populated and active.
- [x] **Universal Provider Hardening**: `encompass-universal.ts` refactored to use dynamic routes and bypass legacy 403 paths.
- [x] **Telemetry Ingestion**: `bom_telemetry` table created and `encompass_403_blocked` events are successfully logging 403/429 failures.
- [x] **Legacy Purge**: `ENCOMPASS_BRAND_MAP` and related hardcoded configs removed from `encompass-universal.ts` and `encompass-family.ts`.

## Verification Results
- **Hisense (HRF266N6CSE)**: Correctly attempts direct assembly path. 403 detected and logged to telemetry.
- **Danby (DCR032A2BDB)**: Correctly attempts direct assembly path. 403 detected and logged to telemetry.
- **Roper (RTW4516FW)**: Correctly resolves Whirlpool alias via DB and attempts hardened path. 403 detected and logged.

## Next Actions
1. [ ] **Telemetry Audit**: Run `SELECT * FROM bom_telemetry WHERE event = 'encompass_403_blocked' ORDER BY created_at DESC;` to identify current blocks.
2. [ ] **Optimization**: Tune `BOM_FETCHER_MIN_DELAY` / retry settings based on observed 403/429 rates (currently set to 2s-5s in `.env`).
3. [ ] **Infra Patching**: Consider adding proxy rotation or browser-based workers for the 403-blocked direct assembly paths.

## Source of Truth
- **Table**: `encompass_brand_routes`
- **Telemetry**: `bom_telemetry`
- **Primary Service**: `encompass-route-service.ts`
