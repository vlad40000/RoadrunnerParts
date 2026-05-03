# BOM Extraction Pipeline

## Overview
The BOM (Bill of Materials) extraction pipeline is responsible for identifying appliance models, resolving authoritative parts sources, and extracting structured parts data.

## Architecture

### 1. Identity Extraction
- **Model**: `gemini-3.1-flash-lite-preview` (Lite Tier)
- **Purpose**: Fast and cost-efficient extraction of Brand, Model, and Product Type from raw seed strings.
- **Service**: `src/features/bom/agents/identity-extractor.ts`

### 2. Source Resolution & Grounding
- **Mechanism**: **Brand Source Gate**
- **Purpose**: Prevent cross-brand contamination by enforcing strict domain-to-brand mappings.
- **Prompting**: Uses `<source_resolver_contract>` XML blocks to define forbidden domains and authoritative OEM paths.
- **Registry**: `src/features/bom/registry/brand-source-gate.ts`

### 3. Encompass Hardening
- **Table**: `encompass_brand_routes` (Neon DB)
- **Path Strategy**: Prefers `Exploded-View-Search` URL patterns over `/model/` paths to bypass 403 access blocks.
- **Resolver**: `src/features/bom/services/encompass-route-service.ts`

### 4. Parts Extraction
- **Model**: `gemini-3.1-flash`
- **Output**: Structured JSON following the `bomRowSchema`.
- **Validation**: Strict reconciliation against expected part counts derived from Encompass or Sears catalog metadata.

## Database Schema

### `encompass_brand_routes`
Maps brand names to Encompass-specific abbreviations and hardened search URLs.
- `brand` (text, PK)
- `abv` (text)
- `target_brand` (text)
- `exploded_view_search_url` (text)
- `is_alias_or_rollup` (boolean)

## Configuration
- **Model Runner**: `src/lib/model-runner.ts` defines tiers (`lite`, `fast`, `smart`).
- **Source Registry**: `src/lib/partsSourceRegistry.ts` defines available parts distributors.
