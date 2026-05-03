# RoadrunnerParts Workflow State

## Current checkpoint

Parts-only BOM prompt cleanup and deterministic provider path are verified.

Verified:
- Fix.com sentinel logic
- grouped BOM discovery order
- retail-pricing waterfall
- redundant fix-com-diagrams removal
- legacy pricing string grep audit in BOM routes
- typecheck
- build

## Architecture decisions

BOM discovery is Parts Only.

Pricing is a separate enrichment lane and must never create BOM rows.

Canonical prompt modules:
- `src/features/bom/prompts/engine.ts`
- `src/features/bom/prompts/identity.ts`
- `src/features/bom/prompts/parts.ts`
- `src/features/bom/prompts/diagram.ts`

API routes must be thin controllers.

The retrieval pipeline should prefer:
1. DB complete cache
2. deterministic Fix.com provider
3. manufacturer/provider traversal
4. primary fallback
5. secondary fallback
6. AI schematic miner only as recovery

## Current protection layer

Smoke checks:
- `npm run smoke:prompts`
- `npm run smoke:classifier`
- `npm run smoke:cache`
- `npm run smoke`

## Next development target

Runtime fixture validation for real models:
- dryer
- washer
- dishwasher or refrigerator

Validate:
- expected count propagation
- honest result states
- no complete cache writes for zero-row results
- pricing route enriches only verified parts
