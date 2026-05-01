# WORKFLOW_STATE.md - BOM Retrieval Pipeline Refactoring

## Current Status
- **Phase 1: Foundation (Complete)**: Prompt XML structure, Identity separation, Basic persistence.
- **Phase 2: Core Implementation (Complete)**: Stage 0 Intake, Specialized Workers, Full State Machine Orchestrator, Deterministic Coverage discovery.
- **Phase 3: Hardening & Validation (Complete)**: Zod schemas implemented for every stage, strict state persistence, evaluator tests.
- **Phase 4: UI & Integration (In Progress)**: UI updates pending.

## Key Accomplishments
- **Zod Hardening**: Defined strict I/O schemas for Stages 0, 1, 2, 3, and 4 in `bom.ts`.
- **Stage 0 Intake**: Created `seed-intake.ts` to process initial evidence with strict validation.
- **Specialized Workers**: Updated `parts-extractor.ts` to use provider-specific prompts and strict output typing.
- **Deterministic Orchestrator**: Refactored `bom-orchestrator.ts` into a robust state machine using the hardened `BuildBomJobState`.
- **Coverage Discovery**: Stages now return `expectedPartCount` and `paginationComplete` for hard coverage validation.
- **Evaluator Tests**: Created `scratch/evaluator_tests.ts` for automated BOM quality checks.

## Remaining Work
1. **Source Lookup Implementation**: Flesh out `runSourceLookup` with actual search/validation logic if required (currently placeholder).
2. **UI Integration**: Update frontend components to display the new machine states (`parts_partial`, `needs_fallback`) and coverage warnings.
3. **End-to-End Testing**: Run the pipeline against a battery of diverse model inputs.

## Handover Context
- State is persisted in `scratch/state_{jobId}.json`.
- The pipeline now adheres to the "Rail-First" design with strict JSON contracts.
- Machine states are: `no_result`, `summary_only`, `needs_fallback`, `parts_partial`, `bom_complete`, `failed`.
