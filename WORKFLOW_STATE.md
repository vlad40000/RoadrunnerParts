# Workflow State: Encompass Hardening & Agentic Pivot

## Current Phase: Agentic Visual Bypass Integration
We are transitioning the BOM extraction pipeline from legacy scraping to an agentic visual loop to resolve persistent Encompass 403/429 blocks.

### Completed Tasks
- [x] Database migration for `bom_telemetry`, `diagram_manifest`, and `bom_part_mapping`.
- [x] Implementation of `ComputerUseSupervisor` for real-time visual agent monitoring.
- [x] Integration of `ComputerUseSupervisor` into `BomWorkflowControlPanel` (UI Refactor started).
- [x] Telemetry instrumentation in `fetchHtml` to log block events.
- [x] Deprecation of legacy hardcoded brand routes in favor of `encompass_brand_routes` DB table.

### **Gold Truth Reference**
- **Maytag MVWB300WQ2**:
  - `abv`: `MAY`
  - `model_option_value`: `9272`
  - `url`: `https://encompass.com/Exploded-View-Assembly/MAY/9272/MVWB300WQ2`

### **Current Tasks**
1. [x] Telemetry Migration: `bom_telemetry` table active.
2. [x] Direct Route Hardening: `encompass_brand_routes` integrated.
3. [/] Computer Use Integration: `ComputerUseSupervisor` component added to `BomWorkflowControlPanel`.
4. [x] Ingest Maytag Gold Truth into `encompass_model_urls`.
5. [x] Implement `resolveEncompassModelUrl` in `EncompassRouteService`.
6. [x] Update `encompass-universal.ts` to use `resolveEncompassModelUrl`.
7. [ ] Verify `ComputerUseSupervisor` visual loop with Maytag model.

### In Progress
- [x] Finalizing the visual loop implementation in `computer-use-agent.mjs`.
- [x] Testing the agentic bypass against real Encompass 403 triggers.
- [x] Automated Reconciliation Service integration for high-integrity Truth Scores.

### Blockers
- [ ] Verifying visual capture stability in high-latency environments.
- [ ] Finalizing the HITL (Human-in-the-Loop) approval flow for high-consequence agent actions.
