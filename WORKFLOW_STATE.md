# RoadrunnerParts - Workflow State

## Current Focus
Hardening DB-First Persistence Architecture for BOM Ingestion.

## Recently Completed
- **Hardened Persistence**: Implemented mandatory DB sinks for BOM orchestration and AI fallback paths.
- **Model Discovery**: Automated seeding of `appliance_model` table from Nameplate OCR and PDF extractions.
- **Telemetry Hooks**: Integrated `nameplate_extractions` logging directly into `src/lib/gemini.ts`.
- **Schema Consolidation**: Merged nameplate table definitions into `appliance-models.ts`.
- **Build Stability**: Resolved Turbopack syntax errors (route.ts), redeclaration conflicts (encompass-supervisor.mjs), and TypeScript type-safety regressions (control panel rendering and orchestrator property access). Fixed major code duplication and nested import errors in `App.tsx` that were blocking Vercel deployments.

## Data Flow Status (DB-First Enforced)
1. **Nameplate/PDF Upload** -> `nameplate_extractions` (Event Log) + `appliance_model` (Seed Entry)
2. **BOM Retrieval (Deterministic)** -> `provider_part_seed_rows` (Raw Data) + `model_parts_cache` (Normalized)
3. **BOM Retrieval (AI Fallback)** -> `model_sources` (Raw LLM Output) + `model_parts_cache` (Normalized)

## Pending Work
- **Schema Cleanup**: Drop `appliance_parts_cache` legacy table after verifying data migration to `model_parts_cache`.
- **Supplier Row Audit**: Verify that all supplier variants (Sears, Encompass, etc.) are correctly populating `provider_part_seed_rows`.
- **E2E Test**: Perform a full "Blind Model" ingestion (Upload Image -> Generate BOM) and verify every stage has a corresponding DB row.

## Architecture Notes
- Strictly using `sql` tagged template literals and Drizzle ORM for all DB interactions.
- Avoid in-process volatile state; every "Discovery" must hit the DB before returning to UI.
