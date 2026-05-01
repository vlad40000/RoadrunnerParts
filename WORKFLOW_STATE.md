# WORKFLOW_STATE.md - BOM Retrieval Pipeline Refactoring

## Current Status
- **Phase 1: Foundation (Complete)**: Prompt XML structure, Identity separation, Basic persistence.
- **Phase 2: Core Implementation (Complete)**: Stage 0 Intake, Specialized Workers, Full State Machine Orchestrator, Deterministic Coverage discovery.
- **Phase 3: Hardening & Validation (Complete)**: Zod schemas implemented for every stage, strict state persistence, evaluator tests.
- **Phase 4: Build & Deployment (Complete)**: Resolved "Module not found" errors, fixed all TypeScript errors.
- **Phase 6: Code Quality & Maintenance (Complete)**: Comprehensive refactoring of `partselect.ts` and `encompass-family.ts`. Resolved all informational IDE linting messages (named interfaces, explicit return types, `Array<T>` notation).
- **Phase 7: Type Synchronization (Complete)**: Synchronized `ProviderSourceType` and `BomStatus`/`RetrievalState` across the core extraction pipeline.

## Key Accomplishments

- **BOM Provider Cleanup**: Refactored `partselect.ts` and `encompass-family.ts` to strictly follow TypeScript best practices.
- **State Machine Evolution**: Expanded `RetrievalState` enum in `schemas/bom.ts` to include intermediate job stages and all valid outcome statuses, resolving multiple build regressions.
- **Schema Hardening**: Fixed Drizzle type mismatch in `part-pricing.ts` by updating `bigserial`/`bigint` fields to `mode: "bigint"`.
- **Source Type Safety**: Imported and utilized `ProviderSourceType` in `parts-extractor.ts`, `run-bom-recovery.ts`, and `seeded-provider.ts`.

## Remaining Work

1. **Core Logic Alignment**: Resolve pre-existing structural type mismatches in `bom-normalizer.ts` (retailPrice object vs number) and `run-bom-extraction.ts` (missing properties).
2. **UI Integration**: Update frontend components to handle expanded `RetrievalState` values.
3. **End-to-End Testing**: Run the pipeline against a battery of diverse model inputs.

## Handover Context

- **Build State**: Providers are 100% type-safe. Pre-existing structural mismatches in `bom-normalizer.ts` and `run-bom-extraction.ts` still block full `tsc` passing.
- **Security**: Sensitive keys are exclusively server-side.
- **Module Resolution**: All imports are standardized to `@/` pointing to `src/`. 
- **Authority Rule**: No fixed priority; selection is driven by the most expedient path to completion using current information availability.
- Machine states (Expanded): `no_result`, `identity_extraction`, `sources_resolved`, `parts_partial`, `bom_complete`, `failed`, etc. (See `schemas/bom.ts`).
