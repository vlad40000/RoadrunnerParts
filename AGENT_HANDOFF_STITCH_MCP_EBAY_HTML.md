# Agent Handoff: Stitch MCP for eBay HTML Design

## Current Goal

Create an additional HTML/design pass for the RoadrunnerParts eBay listing review flow using **Stitch MCP** for the HTML/UI design portion only.

Active repo:

`C:\Users\bradv\Downloads\RoadrunnerParts-main (21)`

Current local output:

`scratch/ebay-zero-drift-final-52/`

Current generator:

`scripts/run-ebay-zero-drift-chain.mjs`

## Required Startup Read

Before changing code, read:

1. `RULE.md`
2. `WORKFLOW_STATE.md`
3. `.agents/policies/session-start.md`
4. `AGENTS.md`

## Non-Negotiable Boundary

The **parts in the part photos are what is being sold**.

The donor machine nameplate, model number, serial number, and assembly diagrams are **validation tools only**. They must never be treated as sale photos or uploaded as eBay listing images.

Correct separation:

- `ebay_listing_payload.attachedImages`: actual sale photos of the physical part only.
- `validationEvidence.nameplateImage`: donor/nameplate proof only.
- `validationEvidence.assemblyDiagram`: diagram/callout validation only.
- HTML may show validation evidence in an internal/operator section, but must clearly label it as validation evidence, not listing media.

## Evidence Currently Wired

Donor evidence comes from:

`C:/Users/bradv/Downloads/HTDX100ED3WW_ZA801821C_BOM.xlsx`

Donor identity:

- Brand: `Hotpoint`
- Model: `HTDX100ED3WW`
- Serial: `ZA801821C`
- Type: `Electric Dryer`

Diagram assets live in:

`public/diagrams/HTDX100ED3WW/`

Canonical diagram sections:

- `BACKSPLASH, BLOWER & DRIVE ASSEMBLY`
- `CABINET & TOP PANEL`
- `DRUM`
- `FRONT PANEL & DOOR`

Part sale photos are matched from:

`scratch/approved-images/`

## Current State

The current runner generates:

- `scratch/ebay-zero-drift-final-52/index.html`
- one HTML file per listing
- `scratch/ebay-zero-drift-final-52/chain-payloads.json`

Latest verification:

- 49 listings processed
- 21 listings have matched part photos
- 28 listings are `part_photo_pending`
- 0 diagram/nameplate paths in `attachedImages`
- `npm.cmd run typecheck` passed

## Stitch MCP Task

Use Stitch MCP only to create a better operator-facing HTML design for the listing review pages.

Recommended Stitch workflow:

1. Use `create_project` for a RoadrunnerParts eBay listing review/dashboard project.
2. Use `generate_screen_from_text` for:
   - dashboard/index screen
   - individual listing review screen
3. Use `generate_variants` if useful for alternate visual directions.
4. Use `get_screen` / `list_screens` to inspect results.
5. Use the selected Stitch output as a design reference for a new local output folder.

Do not use Stitch MCP to alter:

- part numbers
- model/serial evidence
- diagram mappings
- prices
- HITL routing
- image evidence rules
- `attachedImages`
- database writes
- live eBay sync

## Desired Output

Create a separate comparison output folder, for example:

`scratch/ebay-zero-drift-stitch-html/`

Keep the current folder intact:

`scratch/ebay-zero-drift-final-52/`

The Stitch-designed output should read from the same structured payload source:

`scratch/ebay-zero-drift-final-52/chain-payloads.json`

The new HTML should prioritize:

- actual part photos first
- clear `PART PHOTO PENDING` state when missing
- title, part number, price, condition, diagram callout
- donor validation panel that is clearly internal/operator evidence
- HITL review badges
- concise operator audit flow

## Critical UI Language

Use explicit labels:

- `Part Photos For Sale`
- `Part Photo Pending`
- `Internal Validation Evidence`
- `Donor Machine`
- `Donor Serial`
- `Diagram Callout`
- `Assembly Diagram Section`

Avoid any label that implies diagrams/nameplate are product photos.

## Commands Already Run

These were run successfully:

```powershell
node scripts/run-ebay-zero-drift-chain.mjs
npm.cmd run typecheck
```

## Next Concrete Action

After Stitch MCP is available in the tool list, generate the design screens, choose the best variant, then implement a separate HTML export path that uses the existing `chain-payloads.json` without changing the data pipeline.

