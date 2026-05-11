# RoadrunnerParts Markdown Document Map

Use this map to avoid bulk-reading every Markdown file. Read the startup core first, then read only the task pack that matches the current work.

If the operator wants to read everything, use the full reading order below. It keeps the live rules first, then task manuals, then archive/generated material.

## Weight Scale

- `100`: mandatory startup or source-of-truth control
- `80`: task-triggered operating rule
- `60`: useful reference
- `40`: historical or duplicate context
- `20`: generated, stale, or low-signal artifact

## Startup Core

| Weight | File | Read When | Action |
| --- | --- | --- | --- |
| 100 | `AGENTS.md` | Every RoadrunnerParts session | Keep small. Startup contract and BOM truth boundary. |
| 100 | `.agents/policies/session-start.md` | Every RoadrunnerParts session | Keep small. Canonical session checklist. |
| 100 | `RULE.md` | Every RoadrunnerParts session | Keep small. Model and stack lock. |
| 100 | `WORKFLOW_STATE.md` | Every RoadrunnerParts session | Keep, but prune stale sections into dated archives when it grows. |
| 90 | `.agents/policies/agent-manager.md` | Before search, browser, extraction, or model routing | Keep as task-triggered policy. |

## Full Reading Order

1. `AGENTS.md`
2. `.agents/policies/session-start.md`
3. `RULE.md`
4. `WORKFLOW_STATE.md`
5. `.agents/policies/agent-manager.md`
6. `.agents/policies/anti-chaos.md`
7. `.agents/policies/prompt_engineering_rubric.md`
8. `SOP.md`
9. `promoted-rules.md`
10. `PROMPT_ENGINEERING_STANDARD.md`
11. `docs/features/bom-extraction.md`
12. `docs/providers/viability-sweep-2026-04-17.md`
13. `HARDENING_GUIDE.md`
14. `GEMINI_3_COOKBOOK.md`
15. `docs/bom-cockpit-cheatsheet.md`
16. `src/features/bom/prompts/prompt-scenarios.md`
17. `OPERATOR_MANUAL.md`
18. `workflow.md`
19. `.agents/skills/supervisor-router.md`
20. `.agents/skills/analyzer.md`
21. `.agents/skills/final-reviewer.md`
22. `.agents/skills/designer.md`
23. `.github/BRANCH_PROTECTION.md`
24. `implementation_plan.md`
25. `docs/STRATEGY.md`
26. `docs/WORKFLOW_STATE.md`
27. `README.md`
28. `scratch/ebay-listing-3/README.md`
29. `scratch/ebay-listing-3/ATTRIBUTIONS.md`
30. `scratch/ebay-listing-3/guidelines/Guidelines.md`
31. `src/features/bom/components/Untitled-1.md`

## Task Packs

### BOM Extraction And Provider Evidence

| Weight | File | Read When | Action |
| --- | --- | --- | --- |
| 90 | `SOP.md` | BOM extraction, provider scraping, or artifact naming | Keep, but split provider methods into provider-specific mini files if it keeps growing. |
| 85 | `promoted-rules.md` | RALPH loop or prompt-chain execution | Keep tiny. One shard per line. |
| 80 | `PROMPT_ENGINEERING_STANDARD.md` | Writing or auditing BOM prompts | Consolidate with the rubric only after conflicts are resolved. |
| 75 | `.agents/policies/prompt_engineering_rubric.md` | Editing individual stage prompts | Keep tiny. This is the bite-sized prompt checklist. |
| 70 | `docs/features/bom-extraction.md` | Explaining or changing the BOM data path | Keep as architecture reference. |
| 65 | `docs/providers/viability-sweep-2026-04-17.md` | Provider priority or source viability questions | Archive as dated evidence. Do not treat as current without rechecking. |
| 60 | `HARDENING_GUIDE.md` | Encompass or blocked-provider hardening | Keep as tactical reference. |
| 55 | `GEMINI_3_COOKBOOK.md` | Designing agent recovery patterns | Keep as cookbook, not startup material. |

### Operator UI, Prompt Workspace, And Controls

| Weight | File | Read When | Action |
| --- | --- | --- | --- |
| 80 | `.agents/policies/anti-chaos.md` | UI, copy, styling, or layout edits | Keep tiny. Consider adding to mandatory read for UI tasks. |
| 70 | `docs/bom-cockpit-cheatsheet.md` | `/bom-workflow` or cockpit UI changes | Keep, but refresh screenshots/labels after UI changes. |
| 65 | `src/features/bom/prompts/prompt-scenarios.md` | Prompt scenario registration or UI scenario labels | Keep near scenario code. |
| 60 | `workflow.md` | Adding or changing documentation | Keep as doc hygiene rule. |
| 55 | `OPERATOR_MANUAL.md` | Human operator flow or manual retrieval UX | Keep as operator-facing reference. |

### Agent Roles And Review

| Weight | File | Read When | Action |
| --- | --- | --- | --- |
| 70 | `.agents/skills/supervisor-router.md` | Delegating work across local skills | Keep small. |
| 65 | `.agents/skills/analyzer.md` | Data parsing or fact-checking skill routing | Keep small. |
| 65 | `.agents/skills/final-reviewer.md` | Final QC or structured pass/fail review | Keep small. |
| 55 | `.agents/skills/designer.md` | Image or visual asset generation | Keep small; low relevance unless design task. |

### GitHub, Planning, And Strategy

| Weight | File | Read When | Action |
| --- | --- | --- | --- |
| 60 | `.github/BRANCH_PROTECTION.md` | CI, branch protection, or publish flow | Keep as GitHub admin reference. |
| 45 | `implementation_plan.md` | Recovering an older BOM fix plan | Archive once superseded by implemented docs. |
| 45 | `docs/STRATEGY.md` | Shared-image strategy questions | Archive as strategy note. |
| 40 | `docs/WORKFLOW_STATE.md` | Historical workflow comparison only | Consolidate or archive. Root `WORKFLOW_STATE.md` wins. |

## Low-Signal Or Generated Markdown

| Weight | File | Why Low Signal | Action |
| --- | --- | --- | --- |
| 30 | `README.md` | Generic AI Studio app text, not Roadrunner-specific | Replace with a real project quickstart later. |
| 25 | `scratch/ebay-listing-3/README.md` | Generated Figma/code-bundle note | Keep in scratch only. Do not use as repo guidance. |
| 25 | `scratch/ebay-listing-3/ATTRIBUTIONS.md` | Generated attribution artifact | Keep with scratch artifact. |
| 20 | `scratch/ebay-listing-3/guidelines/Guidelines.md` | Template placeholder guidance | Ignore unless editing that scratch bundle. |
| 15 | `src/features/bom/components/Untitled-1.md` | Large orphaned Computer Use reference in source tree | Move to archive or delete after confirming no active dependency. |

## Consolidation Rules

1. Do not merge mandatory startup rules into long manuals.
2. Keep each mandatory startup file under one screen when possible.
3. Split by trigger, not by topic breadth: startup, BOM extraction, UI edits, prompt edits, provider hardening, eBay/listing artifacts.
4. Root `WORKFLOW_STATE.md` is the live state file. Any duplicate workflow state file is historical unless explicitly promoted.
5. Scratch Markdown is artifact-local context, not project policy.
