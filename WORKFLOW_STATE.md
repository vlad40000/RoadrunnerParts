# Workflow State: Encompass Hardening & Agentic Pivot

## Current Phase: Agentic Visual Bypass Integration
We are transitioning the BOM extraction pipeline from legacy scraping to an agentic visual loop to resolve persistent Encompass 403/429 blocks.

### Completed Tasks
- [x] Database migration for `appliance_models` and `nameplate_extractions`.
- [x] Consistently typed `appliance_models` across retrieval and BOM services.
- [x] Fixed JSX parsing and TypeScript errors in `BomWorkflowControlPanel`.
- [x] Hardened `runTargetedBomRecovery` logic with safe iteration and filtering.
- [x] Ingested Maytag gold truth record into DB for direct bypass testing.

### **Gold Truth Reference**
- **Maytag MVWB300WQ2**:
  - `abv`: `MAY`
  - `model_option_value`: `9272`
  - `url`: `https://encompass.com/Exploded-View-Assembly/MAY/9272/MVWB300WQ2`

### **Current Tasks**
1. [x] Telemetry Migration: `bom_telemetry` table active.
2. [x] Direct Route Hardening: `encompass_brand_routes` integrated.
3. [x] Computer Use Integration: `ComputerUseSupervisor` component added to `BomWorkflowControlPanel`.
4. [x] Normalized database schema nomenclature (singular `appliance_model` -> plural `appliance_models`).
5. [x] Hardened `nameplate_extractions` pipeline with strict `raw_result` constraints.
6. [x] Audited and fixed legacy SQL migrations (0006, 0007) for schema consistency.
7. [x] Verified `ComputerUseSupervisor` telemetry and data flow stability.

### In Progress
- [/] Implementing the Human-in-the-Loop (HITL) approval flow (Blocker resolution).
- [x] Finalizing the visual loop implementation in `computer-use-agent.mjs`.
- [x] Testing the agentic bypass against real Encompass 403 triggers (Confirmed block).
- [ ] Automated Reconciliation Service integration for high-integrity Truth Scores.

### Parallel Lanes (Active)
- **Agent A — Layout Shell Lane**
  - Target: `src/features/bom/components/cockpit/cockpit-layout.tsx` (new extraction boundary)
  - Scope: 4K shell, 460px right rail, cockpit visual composition only.
- **Agent B — HITL Logic Lane**
  - Targets: `src/features/bom/components/computer-use-supervisor.tsx`, `browser-agent/computer-use-agent.mjs`, job PATCH/telemetry confirm routes.
  - Scope: manual gate state transitions, confirmation/poll responsiveness, provider 403 handling, no global layout/CSS edits.

### Blockers
- [ ] Verifying visual capture stability in high-latency environments.
- [/] Finalizing the HITL (Human-in-the-Loop) approval flow for high-consequence agent actions.
