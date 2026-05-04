# Session Start Policy

These rules are mandatory for all agents when a RoadrunnerParts session starts.

## Required Reading

Before edits, extraction runs, or architecture decisions, read:

- `RULE.md`
- `WORKFLOW_STATE.md`
- `AGENTS.md`
- `.agents/policies/agent-manager.md`

For BOM extraction, browser-agent, or CoVe work, also read:

- `browser-agent/cove-reviewer-prompt.mjs`
- `browser-agent/cove-verifier.mjs`

## Context Window Handoff Rule

When an agent's context window reaches 85% usage, it must write a concise handoff summary for the beginning of the next conversation before continuing deep work.

The summary must include:

- current goal
- active repo/path
- files changed or inspected
- commands already run
- unresolved blockers
- next concrete action

Preserve operator decisions and source-of-truth boundaries, especially BOM evidence rules, prompt-review requirements, provider gates, and database write paths.

## CoVe Reviewer Boundary

The systematic appliance architecture prompt is a reviewer and recovery-planning tool. It may identify likely missing functional systems, conditional systems, or re-scan targets.

It must not generate final BOM rows, OEM part numbers, prices, or cache-complete claims without source evidence.

## Data Flow Rule

Preferred ingestion flow:

`browser-agent` rendered extraction -> source-backed raw rows -> `model_parts_raw` -> reconcile/classify -> `appliance_parts_cache` -> app response.

Do not bypass reconciliation by writing prompt-inferred data directly into `appliance_parts_cache`.
