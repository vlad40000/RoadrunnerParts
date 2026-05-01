# WORKFLOW_STATE.md - BOM Retrieval Pipeline Refactoring

## Current Status
- **Phase 1: Foundation (Complete)**: Prompt XML structure, Identity separation, Basic persistence.
- **Phase 2: Core Implementation (Complete)**: Stage 0 Intake, Specialized Workers, Full State Machine Orchestrator, Deterministic Coverage discovery.
- **Phase 3: Hardening & Validation (Complete)**: Zod schemas implemented for every stage, strict state persistence, evaluator tests.
- **Phase 4: Build & Deployment (Complete)**: Resolved "Module not found" errors, fixed all TypeScript errors.
- **Phase 6: Code Quality & Maintenance (Complete)**: Comprehensive refactoring of `partselect.ts` and `encompass-family.ts`. Resolved all informational IDE linting messages (named interfaces, explicit return types, `Array<T>` notation).
- **Phase 7: Type Synchronization (Complete)**: Synchronized `ProviderSourceType` and `BomStatus`/`RetrievalState` across the core extraction pipeline.
- **Phase 10: Identity Pipeline Hardening & Type Stability (Complete)**: Aligned identity extraction with structured JSON contracts using nested `candidate_identity` schemas. Fixed OCR API route for normalized identity fields. Achieved 100% `tsc` pass rate by resolving hoisting and schema mismatches.
- **Phase 11: Distributor-Only Policy & Source Resolution (Complete)**: Implemented strict "distributor-only" policy for BOM retrieval. OEM official site searches are now prohibited and removed from the agent tool surface. Hardened source resolution with zero-latency deterministic fast-paths, tiered distributor routing (Encompass/Sears/PartsDr -> APP/PartSelect/Fix/RepairClinic), and soft-validation for 403-blocked domains. Rewired the extraction sequence in `discoverDiagramGroupsForJob` to follow this tiering.
- **Phase 12: Structural Pricing Dependency (Complete)**: Hardened the BOM completion contract. Pricing completeness now strictly requires parts completeness. Implemented state machine transitions in `bom-validator.ts` and `contract.ts` that prevent `bom_complete` status until both manifest coverage and verified retail pricing are 100% satisfied. Introduced granular `parts_complete_pricing_missing` and `parts_complete_pricing_partial` statuses. Verified with unit tests.
- **RetrievalState Standardization**: Standardized `RetrievalState` and `BomStatus` schemas to include all system states (23 values), ensuring type-safety across Single and Batch orchestrators. Resolved Gemini tool schema compatibility issues.
- **Contract Enforcement**: Implemented `determineRetrievalState` in a new `contract.ts` service. Integrated this logic into the agent dispatcher to ensure the "BOM Completion Gate" is governed by deterministic rules rather than AI heuristics.
- **Diagram-Indexed Manifest Contract**: Parts completeness now uses a trusted exact-model `total_part_count` as the target, builds a full diagram manifest as the expected row set, and maps canonical BOM rows against required manifest rows before completion can be claimed.
- **Source Routing & Tiering**: Standardized distributor tiers (Tier 1: Encompass, Sears, PartsDr, APP) and family-specific routing rules (e.g., GE assembly-first, Frigidaire distributor-first). Verified Encompass `WHI` prefixing and non-derivable `assemblyId` extraction.
- **Phase 8: Multi-Agent Architecture (Complete Tool Surface)**: Finalized 19 core function declarations across OCR, Identity, DB/Cache, Source Resolution, and Extraction stages. Standardized dispatcher logic to enforce strict schemas and deterministic state gates.
- **Verified Retail Pricing Contract**: Implemented strict pricing priority (Encompass #1) and verification rules. Updated `bom.ts` with comprehensive `ListedPriceStatus` enums and `VerifiedRetailPrice` types. Enforced exact-part-number matching gate for all retail pricing evidence.
- **Database Schema Hardening**: Synchronized Drizzle ORM schemas with core DDL. Implemented `machine_inventory`, `appliance_model`, `model_source`, `bom_part`, and `part_price_snapshot` with strict `CHECK` constraints for BOM completion and pricing integrity.
- **eBay Market & Listing System (System 2)**: Deployed 14 specialized eBay tools for resale signal analysis and listing generation. Established strict boundaries: eBay data is for resale demand and net expected value only, never for retail pricing. Implemented `ebay_market_snapshot` and `channel_listing` schemas.
- **Machine Prioritization Engine**: Implemented a weighted (0-1000) prioritization formula and `RecommendedAction` logic (inspect, repair, part-out, etc.) based on machine age, MSRP, verified part value, and eBay market signals.

## Key Accomplishments

- **BOM Provider Cleanup**: Refactored `partselect.ts`, `encompass-family.ts`, `fix-com.ts`, `sears-partsdirect.ts`, `partsdr.ts`, `repairclinic-family.ts`, and `appliancepartspros.ts` to strictly follow TypeScript best practices.
- **OEM-First Resolver Strategy**: Implemented specific resolution logic for GE (assembly-first), Bosch (E-Nr mandatory), Frigidaire (distributor-practical), LG (Encompass partner), and Samsung (variant-sensitive).
- **Encompass Whirlpool Rule**: Implemented strict Whirlpool-family rules for Encompass. This includes deterministic model URL construction (`WHI{MODEL}`) and extraction of the non-derivable `assemblyId` from the Interactive Exploded View.
- **Deterministic URL Optimization**: Updated `deterministic-urls.ts` with verified patterns for GE, Whirlpool, Maytag, LG, and Samsung models.
- **Verified Model Context**: Added verified mappings for GTE18GTHERWW, MVWB765FW3, WTW7500GC2, GTW725BSN0WS, WM2501HWA, WT7200CV, MLE2000AYW, and RF263TEAESG/AA.
- **Router Rule Enforcement**: Updated `source-fetcher.ts` to prioritize OEM Official sources first, followed by a co-primary group of high-fidelity distributors (Sears, Fix, Encompass, APP, Parts Dr, PartSelect).
- **State Machine Evolution**: Expanded `RetrievalState` enum in `schemas/bom.ts` to include intermediate job stages and all valid outcome statuses.
- **Schema Hardening**: Fixed Drizzle type mismatch in `part-pricing.ts` by updating `bigserial`/`bigint` fields to `mode: "bigint"`.
- **Source Type Safety**: Imported and utilized `ProviderSourceType` in `parts-extractor.ts`, `run-bom-recovery.ts`, and `seeded-provider.ts`.
- **Multi-Agent Orchestration**: Implemented a stage-based agent pipeline using Gemini Function Calling. Defined structured tool declarations for OCR Ingest, Cache Validation, Source Resolution, and Parts Extraction.
- **Generic Agent Loop**: Created a reusable `runAgentLoop` that manages tool execution and chat history, allowing agents to call local functions in a loop.
- **Asset-Backed Extraction**: Implemented an `AssetStore` to manage temporary HTML and data artifacts during multi-agent sessions, enabling agents to pass page references between tools.
- **Machine Priority Scoring**: Implemented the final Core stage of the BOM pipeline. Created a scoring engine that ranks machines (0-1000) based on MSRP, high-value part counts, and brand desirability.
- **Identity Pipeline Hardening**: Updated `identity-extractor.ts` and `identity.ts` prompts to use nested `candidate_identity` structures, ensuring compliance with strict structured JSON output requirements.
- **OCR API Resolution**: Fixed `app/api/ocr/route.ts` to correctly map normalized identity fields, restoring functionality to the OCR rescue pipeline after schema changes.
- **Full Type Stability**: Resolved all remaining TypeScript build errors across `schemas/bom.ts`, `contract.ts`, `run-bom-recovery.ts`, and `partsSourceRegistry.ts`.
- **RetrievalState Alignment**: Synchronized `determineRetrievalState` logic in `contract.ts` and `bom-validator.ts` with the central `RetrievalState` enum.
- **Tiered Model Routing**: Validated and stabilized `gemini-3.1-flash-lite-preview` for high-throughput identity normalization and ingestion stages.
- **Deterministic URL Resolver Fast-Path**: Implemented a zero-latency deterministic fast-path in `exact-model-url-resolver.ts` for Encompass, PartsDr, AppliancePartsPros, and PartSelect. Integrated soft-validation logic to handle search-indexed URLs that trigger 403 blocks during live validation.
- **Structural Validator Hardening**: Updated `bom-validator.ts` and `grouped-bom.ts` to enforce the structural dependency between parts extraction and pricing. BOM status is capped at `parts_complete_pricing_missing` until the pricing validator confirms full coverage.
- **Distributor Source Agent**: Created `distributor-source-agent.ts` to replace legacy OEM-based retrieval, ensuring all extraction flows follow the approved distributor tier list.
- **Inventory Import Stabilization**: Restored and hardened the `app/api/inventory/import` route after file corruption. Implemented robust `HEADER_ALIASES` synchronized with real-world inventory spreadsheets (e.g., `ModelNumber`, `SerialNumber`, `ApplianceType`, `Availability`). Verified order-independent extraction and raw metadata preservation.

## System Boundaries & Core Rules

### Agent Manager Instructions (Gemini 3)
- **Temperature Policy**: For Gemini 3 agents, keep temperature at default `1.0`. Do not create a Temp-0 frontline agent.
- **Reliability Mechanism**: Reliability must come from narrow tool exposure, mode `ANY` for required calls, explicit `allowed_function_names`, flat schemas, Zod validation, deterministic DB writes, and completion gates.
- **Fallback Protocol**: Fallback means escalating to a stronger model or narrower repair prompt, not changing temperature.
- **Exceptions**: Only use a low temperature if testing proves a specific non-Gemini-3 model/stage benefits from it. Do not apply Temp-0 as a general reliability mechanism for Gemini 3.

- **CORE SYSTEM** = identity, model, BOM, verified retail pricing, inventory priority
- **EBAY SYSTEM** = resale market signal, listing priority, drafts, active/sold comps

| Area                | Core Appliance / BOM / Pricing System                                     | eBay Market / Listing System                                  |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Primary purpose     | Build complete priced BOM and prioritize 6,000 machines                   | Determine resale demand, expected net, and listing strategy   |
| Starts from         | Nameplate OCR, spreadsheet import, model/serial                           | Canonical OEM part number from BOM                            |
| Main truth source   | OEM/distributor diagrams + verified listed retail prices                  | eBay active/sold marketplace data                             |
| Price role          | Source-listed retail price only                                           | Resale signal only                                            |
| Can complete BOM?   | Yes, only if parts and verified pricing complete                          | No                                                            |
| Can estimate price? | No                                                                        | Can calculate market signal, but not retail price             |
| Required before use | Normalized model + part number evidence                                   | Canonical OEM part number                                     |
| Main output         | `bom_complete`, `parts_complete_pricing_partial`, ranked machine priority | sell-through, median sold comp, net expected, listing payload |
| Database ownership  | models, parts, source URLs, verified price snapshots, machine priority    | marketplace snapshots, listing drafts, listing status         |
| Hard failure rule   | Missing verified price means BOM not complete                             | Bad match means exclude from comps                            |

## Core Retrieval Pipeline Workflow

1. **Intake**: Import machine spreadsheet or OCR nameplate image.
2. **Identification**: Extract brand, model, serial, and product code clues.
3. **Normalization**: Resolve brand family and canonical model number.
4. **Decoding**: Decode manufacture date from serial number patterns.
5. **Aging**: Calculate machine age based on decoded manufacture date.
6. **Value Discovery**: Find original MSRP from manufacturer/retailer evidence.
7. **Cache Check**: Query local DB for existing model records.
8. **Trusted Count Assessment**: Accept `trusted_total_part_count` only from an exact-model trusted source.
9. **Manifest Truth Check**: Build a full diagram-indexed manifest and verify stored canonical parts map to every required manifest row.
10. **Pricing Audit**: Verify listed retail price coverage for all required parts.
11. **Source Resolution**: If data is incomplete, resolve truth sources (OEM/Distributor).
12. **Extraction**: Parse diagrams and extract raw part rows from resolved sources.
13. **Synthesis + Mapping**: Normalize and deduplicate raw rows into a canonical BOM, then map every found part against the diagram manifest.
14. **Valuation**: Fetch verified listed retail price per part from high-fidelity providers.
15. **Validation**: Execute final BOM completion gate (Trusted Count + Manifest Mapping + Prices).
16. **Prioritization**: Score machine priority based on age, MSRP, and BOM value.
17. **Dispatch**: Export ranked machine action list for inventory procurement.

## Remaining Work
1. **Regression Testing**: Validate the OCR rescue pipeline (`handleCaptureEbayPage` in `App.tsx`) to ensure no UI-side integration issues persist.
2. **Telemetry Integration**: Monitor stalling metrics for high-throughput identity extraction sessions.
3. **UI/UX Integration**: Surface `manual_review_flags` and `blockers` in the dashboard.

## Diagram Manifest Completion Contract

- A trusted exact-model source may define `trusted_total_part_count`.
- The full diagram parts list becomes the `model_diagram_manifest` and `diagram_manifest_row` target.
- `bom_part` remains the canonical extracted row table.
- `bom_part_mapping` joins required manifest rows to canonical BOM rows.
- Parts completeness requires manifest rows to meet or exceed `trusted_total_part_count`, unresolved required manifest rows to equal `0`, mapped required rows to meet required manifest rows, and stored canonical rows to meet or exceed the trusted count.
- BOM completion still requires every required canonical row to have verified listed retail pricing.
- Retail pricing priority is Encompass first; fallback pricing is used only when Encompass fails, has no price, is blocked, or is ambiguous.

## Handover Context

- **Build State**: Fully type-safe. 100% `tsc` pass rate achieved across all core retrieval and service modules.
- **Security**: Sensitive keys are exclusively server-side.
- **Module Resolution**: All imports are standardized to `@/` pointing to `src/`. 
- **Authority Rule**: No fixed priority; selection is driven by the most expedient path to completion using current information availability.
- Machine states (Expanded): `no_result`, `identity_extraction`, `sources_resolved`, `parts_partial`, `bom_complete`, `failed`, etc. (See `schemas/bom.ts`).## Side-by-Side Agent Map

| Agent | Core System Functions | eBay System Functions |
| :--- | :--- | :--- |
| **OCR Ingest Agent** | `ocr_extract_nameplate`, `normalize_appliance_identity` | None |
| **Cache Check Agent** | `db_get_model_record`, `db_get_model_part_count`, `db_get_parts_for_model`, `db_get_price_coverage_for_model`, `validate_bom_completion` | None |
| **Source Resolver Agent** | `resolve_distributor_sources`, `fetch_source_page`, `extract_diagram_sections` | None |
| **Parts Extraction Agent** | `extract_parts_from_section`, `synthesize_bom`, `db_upsert_bom_parts` | None |
| **Retail Price Agent** | `resolve_part_pricing_sources`, `fetch_encompass_listed_price`, `fetch_fallback_listed_price`, `validate_exact_price_evidence`, `select_primary_verified_price`, `db_upsert_verified_price_snapshot` | None |
| **eBay Market Agent** | *Reads canonical part numbers only* | `ebay_search_active_by_part_number`, `ebay_search_sold_by_part_number`, `filter_ebay_listing_matches`, `calculate_ebay_sell_through`, `calculate_ebay_net_expected`, `db_upsert_market_snapshot` |
| **Listing Agent** | *Reads part inventory only* | `generate_ebay_title`, `generate_ebay_description`, `generate_ebay_item_specifics`, `create_ebay_draft_listing`, `revise_ebay_listing_price`, `end_ebay_listing_when_inventory_sold` |
| **Inventory Priority Agent** | `score_machine_priority`, `rank_inventory_actions`, `export_prioritized_inventory_csv` | *Reads eBay market signal as input* |

## Part Count Source Tiers

- **Tier 1 Count Sources**: encompass, sears-partsdirect
- **Tier 2 Count Sources**: partsdr, appliancepartspros, partselect.com, fix.com
