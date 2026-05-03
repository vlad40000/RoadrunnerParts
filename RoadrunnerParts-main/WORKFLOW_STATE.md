# RoadrunnerParts - Workflow State

## Current Focus
Hardening DB-First Persistence Architecture for BOM Ingestion.

## Recently Completed
- **Hardened Persistence**: Implemented mandatory DB sinks for BOM orchestration and AI fallback paths.
- **Model Discovery**: Automated seeding of `appliance_model` table from Nameplate OCR and PDF extractions.
- **Identity Extraction Hardened**: Implemented Section 16 (Execution Contract) Agent Prompt. Decoupled extraction (Visual Truth) from normalization (Tightened Schema). Transitioned to `ModelIdentity` across agents and orchestrator.
- **Asynchronous Retrieval Pipeline**: Implemented DB-first Encompass BOM + Pricing retrieval. Created a standalone Docker worker with Playwright and Gemini verification support. Updated orchestrator for background handoff.
- **Modular Python Worker**: Refactored worker into a domain-driven structure (`capture/`, `parsers/`, `validators/`, `services/`).
- **Completion Logic**: Implemented strict validation rules requiring 100% pricing coverage and assembly detection for the `bom_complete` state.
- **Build Stability**: Resolved Turbopack syntax errors and TypeScript type-safety regressions.

## Data Flow Status (DB-First Enforced)
1. **Nameplate/PDF Upload** -> `nameplate_extractions` (Event Log) + `appliance_model` (Seed Entry)
2. **BOM Retrieval (Deterministic)** -> `provider_part_seed_rows` (Raw Data) + `model_parts_cache` (Normalized)
3. **BOM Retrieval (AI Fallback)** -> `model_sources` (Raw LLM Output) + `model_parts_cache` (Normalized)

## Pending Work
- **Worker Production Scaling**: Fine-tune the Docker worker's Playwright navigation logic for complex variation landing pages.
- **PDF/OCR Bridge**: Resolve the server-side PDF processing gap by implementing an image snapshot bridge for manual ingestion.
- **E2E Test**: Perform a full "Blind Model" ingestion (Upload Image -> Generate BOM) and verify every stage has a corresponding DB row.

## Architecture Notes
- Strictly using `sql` tagged template literals and Drizzle ORM for all DB interactions.
- Avoid in-process volatile state; every "Discovery" must hit the DB before returning to UI.
