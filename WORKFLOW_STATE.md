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

## Current Progress
- [x] Documented Locked Architecture.
- [x] Implemented `encompass-supervisor.mjs` for steps 2-6.
- [x] Created `EncompassSupervisorPanel` UI component.
- [x] Created `/bom-ingest` Control Panel page.
- [x] Updated `agent.mjs` and supplier agents to support `visualTruth` context.
- [x] Registered `encompass_visual_supervisor` tool in agent dispatcher.

## Next Steps
- Verify the end-to-end reconciliation of Fix.com rows against the Encompass manifest.

## Project Audit (2026-05-02)
- [x] Audited for broken/empty files and folders.
- [x] Identified empty API route skeletons in `app/api/bom/jobs/`.
- [x] Confirmed `typecheck_output.txt` is stale (fresh build passes).
- [x] Noted architectural redundancy between `lib/` and `src/lib/`.
- [ ] Cleanup empty route skeletons.
- [ ] Consolidate `lib/` vs `src/lib/` duplication.
