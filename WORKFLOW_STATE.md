# Workflow State: Encompass Hardening & Agentic Pivot

## Current Phase: Phase 5 - Marketplace Intelligence & Integration Testing (COMPLETE)
We have successfully implemented the eBay marketplace listing pipeline and validated the full end-to-end "URL Handoff" → "Extraction" → "Market Analysis" → "Draft Listing" workflow.

### Completed Tasks
- [x] Database migration for `appliance_models` and `nameplate_extractions`.
- [x] Consistently typed `appliance_models` across retrieval and BOM services.
- [x] Fixed JSX parsing and TypeScript errors in `BomWorkflowControlPanel`.
- [x] Hardened `runTargetedBomRecovery` logic with safe iteration and filtering.
- [x] Ingested Maytag gold truth record into DB for direct bypass testing.
- [x] **BOM Workflow Cockpit Redesign**: Transformed `/bom-workflow` into a high-density fixed-position dark cockpit UI.
- [x] **Reconciliation API**: Exposed `ReconciliationService` via `/api/bom/jobs/[jobId]/reconcile`.
- [x] **Truth Score Persistence**: Reconciliation reports now persist to `bom_jobs.diagramParse`.
- [x] **Cockpit Integration**: "Reconcile" workspace now displays truth score match %, source comparison, and discrepancy logs.
- [x] **HITL Gate Hardening**: Verified `approvalStatus` and `requiresApproval` state transitions in `ComputerUseSupervisor` and PATCH route.
- [x] **Cockpit Infrastructure Hardening**: Populated deterministic agent instructions, added Link Matrix for immediate URL access, and enabled direct instruction editing in preflight.
- [x] **Supplier Expansion**: Integrated PartsDr as the 7th supported agent with auto-loading URLs and deterministic prompt fallbacks.
- [x] **Reactive State**: Ensured supplier URLs and agent instructions auto-populate immediately upon model entry via reactive `useEffect` hooks.
- [x] **Scraper Cockpit & Prompt Architecture**: Established a dedicated `/scraper` interface featuring a Floating Assistant, Browser Emulator, and Prompt Cockpit for agent steering.
- [x] **Data Modeling**: Defined Zod schemas for "Captured Evidence" and "Agent Instructions" to ensure source-resolution compatibility.
- [x] **eBay Listing Tooling**:
  - Implemented `create_ebay_draft_listing` tool logic in `bom-agent-dispatcher.ts`.
  - Created `ebay-listing-service.ts` for database-backed persistence of draft listings and market snapshots.
  - Implemented `db_upsert_market_snapshot` and `db_upsert_channel_listing` real logic.
- [x] **ShareX Integration**:
  - Implemented `POST /api/bom/jobs/[jobId]/captures/sharex` for manual visual evidence ingestion.
  - Updated `ComputerUseSupervisor` UI to render "Visual Evidence" from ShareX uploads.
- [x] **Integration Test (20-Unit Full Loop)**: Verified Phase 1-3 completion with 45+ eBay drafts.
- [x] **Robust Pricing Engine**: Implemented citation-backed research logic with Gemini 3.1 Google Search.
- [x] **HITL Instruction Presets**:
  - Enhanced `SystemInstructionsDrawer` with a "Learned Behavioral Rules" library.
  - Implemented "Promote to Preset" flow for converting job-specific rules into reusable agentic presets.
  - Added real-time instruction synchronization between `bom_jobs` and the Mission Cockpit.

## Current Status
- **Standard Canon Enforced**: All supplier search URLs are now deterministic and centralized in `source-tier-policy.ts`.
- **eBay Pipeline Operational**: The system can move from a raw model/serial to a live eBay draft listing automatically.
- **Visual Loop Ready**: `ComputerUseAgent` is prepared for 403 bypass with HITL gates and ShareX support.
- **Instruction Library Live**: Operators can now manage learned behavioral rules and global presets from a unified high-density drawer.

## Next Steps
1. **Scale Production Execution**: Trigger the pipeline for the full 6,000-unit backlog.
2. **Refine Market Signal Scoring**: Enhance `net_expected` calculations with real-time shipping API integrations.
3. **Competitive Pricing Logic**: Implement an "Auto-Undercut" strategy based on the `lowestActivePrice` signal.

### **Gold Truth Reference**
- **Maytag MVWB300WQ2**: `url`: `https://encompass.com/Exploded-View-Assembly/MAY/9272/MVWB300WQ2`

### In Progress
- [x] Automated Reconciliation Service integration for high-integrity Truth Scores.
- [/] Scaling 6,000-unit batch processing.

### Required Verification:
- [x] `npm run typecheck` — PASSED
- [x] Pricing Research Citations — VERIFIED
- [x] Instruction Promotion Flow — VERIFIED
