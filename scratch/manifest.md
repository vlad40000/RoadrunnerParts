# Directory Manifest: scratch

## Purpose
Temporary and persistent storage for pipeline artifacts, scraper caches, and experimental data.

## Key Artifacts
- **ebay-html-current/**: Active eBay listing HTML previews.
- **ebay-images-current/**: Active eBay image candidates.
- **ebay-automation-chain-current/**: Outputs from the Gemini prompt chain.
- **current-ebay-scope.json**: The current 41-part scope source of truth.

## Governance
- **Owner**: Evidence Automation Lane
- **Source of Truth**: `WORKFLOW_STATE.md`
- **Status**: Active / Mixed

## Build Chain Context
Serves as the primary workspace for the 3-phase state machine (Genesis, Extraction, Trust Shard).

## Agent Activity Log
| Timestamp | Event | %ctxt | #TB | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-12T19:00:00-04:00 | ENTRY | 35% | 5000 | Initializing Build Manifest Standard |
| 2026-05-12T19:06:00-04:00 | EXIT | 46% | 13000 | Manifest created and rules updated |
