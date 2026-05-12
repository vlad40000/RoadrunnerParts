# Directory Manifest: scratch/ebay-html-current

## Purpose
Contains the current set of 41 eBay listing HTML files and the central index for operator review.

## Key Artifacts
- **index.html**: The master dashboard for reviewing the current 41-part scope.
- **listings.normalized.json**: Normalized data structure used by the dashboard and detail pages.
- **[partNumber].html**: Standalone HTML templates for each part.

## Governance
- **Owner**: Evidence Automation Lane
- **Source of Truth**: `scripts/export-ebay-html.mjs`
- **Status**: Active (Generated)

## Build Chain Context
Final output of the HTML generation phase, ready for operator audit before eBay staging.

## Agent Activity Log
| Timestamp | Event | %ctxt | #TB | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-12T19:01:10-04:00 | ENTRY | 38% | 6500 | Initializing Build Manifest Standard |
| 2026-05-12T19:06:10-04:00 | EXIT | 46% | 13500 | Manifest created and rules updated |
