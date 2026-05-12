# Directory Manifest: scripts

## Purpose
Automation engine for the Roadrunner Parts Finder pipeline. Contains tools for extraction, image discovery, HTML generation, and database initialization.

## Key Artifacts
- **export-ebay-html.mjs**: Primary HTML generation script.
- **find-ebay-images.mjs**: Image candidate discovery engine.
- **build-current-ebay-scope.mjs**: Scope management utility.
- **import-ebay-assembly-workbooks.mjs**: Data ingestion from operator spreadsheets.

## Governance
- **Owner**: Evidence Automation Lane
- **Source of Truth**: Repository source
- **Status**: Active (Source)

## Build Chain Context
The "engine room" of the build chain. These scripts transform raw provider data into market-ready listing artifacts.

## Agent Activity Log
| Timestamp | Event | %ctxt | #TB | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-12T19:08:10-04:00 | ENTRY | 48% | 16500 | Initializing Build Manifest Standard |
| 2026-05-12T19:08:30-04:00 | EXIT | 49% | 17000 | Manifest created and rules updated |
