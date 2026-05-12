# Directory Manifest: data

## Purpose
Static data sources, schemas, and reference material for the parts finder.

## Key Artifacts
- **parts-catalog.json**: (If present) The master catalog of supported parts.
- **schemas/**: Zod or TypeScript schemas for data validation.

## Governance
- **Owner**: Evidence Automation Lane
- **Source of Truth**: Repository source / Neon Database
- **Status**: Active (Source)

## Build Chain Context
Provides the foundational data required for part lookups and validation across the pipeline.

## Agent Activity Log
| Timestamp | Event | %ctxt | #TB | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-12T19:09:40-04:00 | ENTRY | 51% | 19500 | Initializing Build Manifest Standard |
| 2026-05-12T19:10:00-04:00 | EXIT | 52% | 20000 | Manifest created and rules updated |
