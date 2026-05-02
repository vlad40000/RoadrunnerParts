# WORKFLOW_STATE - BOM Ingestion (Visual Truth Architecture)
[Rationale: Why this workflow wins](docs/STRATEGY.md)

- **Status**: COMMITTED & PUSHED to `partsapp.git` main.
- **Supervisor**: Encompass (Visual Truth / Visual Supervisor) [ENABLED]
- **Supplier Agents**: Row extractors (Fix.com, Sears) [GROUNDED IN TRUTH]
- **UI**: BOM Ingest Control Panel [ACTIVE]

## Final Workflow (12 Steps)
1. **OCR/Manual Entry**: [COMPLETE] - Model entry in UI.
2. **Resolve Encompass URL**: [COMPLETE] - Handled by supervisor script.
3. **Fetch Model Option**: [COMPLETE] - Integrated into supervisor logic.
4. **Build Exploded-View URL**: [COMPLETE] - Canonical pattern established.
5. **Capture Visual Truth**: [COMPLETE] - Playwright screenshot capture active.
6. **Extract Canonical Manifest**: [COMPLETE] - Totals and names extracted from Encompass.
7. **Show Screenshot**: [COMPLETE] - Displayed in Control Panel Viewport.
8. **Populate Supplier Rows**: [COMPLETE] - URL resolution for Fix/Sears.
9. **Supplier Agent Matrix**: [COMPLETE] - UI Matrix for Fix, RC, APP, Sears.
10. **Agent Context Handover**: [COMPLETE] - `visualTruth` context passed to agents.
11. **Schema-Valid Return**: [COMPLETE] - Agents return `SupplierAgentResponse` JSON.
12. **Reconciliation Merge**: [COMPLETE] - Merging logic prioritized by Encompass manifest.

- [x] Documented Locked Architecture.
- [x] Implemented `encompass-supervisor.mjs` for steps 2-6.
- [x] Created `EncompassSupervisorPanel` UI component.
- [x] Created `/bom-ingest` Control Panel page.
- [x] Updated `agent.mjs` and supplier agents to support `visualTruth` context.
- [x] Registered `encompass_visual_supervisor` tool in agent dispatcher.
- [x] Purged ALL legacy extraction logic and unauthorized suppliers (PartSelect, LG, Samsung, Bosch, etc.).

## Next Steps
- Verify the end-to-end reconciliation of Fix.com rows against the Encompass manifest.

## Project Audit & Cache Integrity (2026-05-02)
- [x] Audited database for cache hit failures.
- [x] Fixed normalization mismatch between `model_parts_cache` and `encompass_model_urls`.
- [x] Integrated `encompassFamilyProvider` into authoritative source loop.
- [x] Implemented early `model_parts_cache` lookup in `bom-orchestrator.ts` after identity extraction.
- [x] Cleanup empty route skeletons.
- [ ] Consolidate `lib/` vs `src/lib/` duplication.
