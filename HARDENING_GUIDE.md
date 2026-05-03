# Roadrunner Encompass Hardening Guide

## Overview
This guide explains the multi-layer defense strategy implemented to bypass aggressive anti-bot protections on Encompass.com. We transition from speculative search-based scraping to a deterministic, visually-aware agentic pipeline.

## 1. The Defense Layers

### Layer 1: Gold Truth Routing (Deterministic)
The primary defense is to avoid search altogether. If a model has been successfully extracted once, its "Gold Truth" assembly URL is stored in the `encompass_model_urls` table.
- **Service**: `EncompassRouteService.resolveEncompassModelUrl(model)`
- **Benefit**: Zero 403 risk from search results. Bypasses 429 triggers by going directly to the target.

### Layer 2: Brand Route Resolution (Predictive)
If no model-specific URL exists, we predict the URL based on known brand-level patterns stored in `encompass_brand_routes`.
- **Service**: `EncompassRouteService.resolveEncompassBrandRoute(brand)`
- **Benefit**: High success rate for major brands (GE, Hisense, Maytag) without triggering search blocks.

### Layer 3: Agentic Computer Use (Visual Bypass)
When direct paths are blocked or variations are too complex, we trigger the `ComputerUseAgent`. 
- **Tool**: `browser-agent/computer-use-agent.mjs`
- **Logic**: Uses Gemini 3 Vision to "see" the screen, solve CAPTCHAs (via HITL if needed), and navigate to the parts list.
- **Supervision**: The `ComputerUseSupervisor` in the UI allows real-time operator oversight.

## 2. Data Reconciliation & Grounding
To ensure 100% integrity, every extraction is passed through the `ReconciliationService`.
- **Logic**: Diffs Encompass output against Sears PartsDirect.
- **Discrepancies**: Flagged as `isDiscrepancy: true` in the final BOM.
- **Confidence Score**: Calculated based on source overlap (Grounding Score).

## 3. Telemetry & Auditing
Every block event (403/429) is logged to the `bom_telemetry` table.
- **Event**: `encompass_hardened_path_blocked`
- **Usage**: Used to identify models that need manual "Gold Truth" ingestion.

## 4. How to Ingest Gold Truth
Use the following SQL pattern to register a canonical URL:
```sql
INSERT INTO encompass_model_urls (brand, encompass_route, encompass_id, model_number, encoded_model_number, normalized_model, url)
VALUES ('BRAND', 'ROUTE', 'ID', 'MODEL', 'MODEL', 'MODEL', 'URL')
ON CONFLICT (normalized_model, encompass_route, encompass_id) DO UPDATE SET url = EXCLUDED.url;
```

## 5. UI Integration
The `BomWorkflowControlPanel` is the master dashboard.
- **Master Eye**: Real-time view of agent browser.
- **Reconciliation Table**: Highlights DIFFs and coverage scores.
