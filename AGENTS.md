# Agent Session Startup Rule

At the start of every RoadrunnerParts session, agents must read these files before changing code or running extraction workflows:

1. `RULE.md`
2. `WORKFLOW_STATE.md`
3. `.agents/policies/session-start.md`

For BOM extraction work, agents must also read:

4. `browser-agent/cove-reviewer-prompt.mjs`
5. `browser-agent/cove-verifier.mjs`

## BOM Source-Of-Truth Boundary

- Browser agents may render provider pages, capture JSON/XHR payloads, extract source-backed rows, and write raw rows to `model_parts_raw`.
- Browser agents must not treat architecture prompts as source evidence.
- CoVe reviewer prompts are for coverage review and missing-system guidance only.
- Final OEM part rows, part numbers, prices, and completeness claims must come from provider evidence, captured JSON, manuals, or existing database records.
- `appliance_parts_cache` should remain an optimized app/cache output produced by the existing reconcile/classify/cache pipeline, not by speculative prompt output.
