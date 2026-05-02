# RoadrunnerParts Workflow State

## High-Level Status
- [x] Identity Extraction (OCR/Manual)
- [x] Manual Distributor Control Panel (UI Wiring Fixed)
- [x] Assembly Multi-Select Logic
- [x] Granular "GO" Extraction
- [x] Conditional Pricing Unlock Logic
- [x] TypeScript Verification (PASSED)
- [x] Production Build (PASSED)

## Current Focus
- Verification of the full operator workflow in a live environment.
- [x] BOM JSON Import: Ingested `roadrunner_bom_csvs_combined.json` into `model_parts_cache` and `model_parts_raw`.

## Completed Milestones
1. **System Hardening:** Resolved TS errors in `source-action-agent.ts` and `App.tsx`.
2. **Manual Control UI:** Refactored `src/App.tsx` to correctly consume `load_supplier_index` and map supplier assemblies to the left rail.
3. **Polling & State:** Fixed background job polling URLs and state synchronization.
4. **Pricing Governance:** Implemented "Target Coverage" gated pricing to prevent premature pricing lookups.
5. **Data Ingestion:** Successfully imported 7 models and 833 part rows from combined CSV-to-JSON snapshot.
6. **Encompass URL Indexing:** Ingested 4,045 model-to-URL mappings from 3 "hot model" JSON files into `encompass_model_urls`.
7. **Brand-Specific Re-routing (IN PROGRESS):** Ingesting 4 new JSON files with logic to force `WHI` route for Amana/Whirlpool while preserving `HOT` for GE and `FRI` for Electrolux.
