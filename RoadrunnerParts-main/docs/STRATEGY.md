# Why the Shared-Image Workflow Wins

The **Encompass Visual Truth** architecture solves the core challenges of multi-supplier BOM ingestion by establishing a "Source of Truth" before running secondary agents.

| Problem | Without Encompass Visual Truth | With Encompass Visual Truth |
| :--- | :--- | :--- |
| **Assembly names differ by supplier** | Hard merge; duplicate sections | Map all names to Encompass assemblies |
| **Supplier returns universal parts** | May enter BOM incorrectly | Flag as `potential_mismatch` |
| **Partial extraction** | Hard to detect gaps | Compare to `expected_total` |
| **Human review** | Rows only; no context | Rows + viewport diagram |
| **Agent output consistency** | Different shapes/schemas | One JSON schema (Zod validated) |

## Core Advantages

1. **Unified Assembly Manifest**: By extracting assembly names from Encompass first, we create a "skeleton" that all other suppliers must fit into.
2. **Visual Reconciliation**: The human reviewer can see the exact diagram callout next to the extracted row, significantly reducing audit time.
3. **Coverage Targets**: The `expected_total` count acts as a quality gate. If Fix.com returns 110 parts but Encompass expects 125, we know exactly where the coverage gap is.
4. **Deterministic Mapping**: Supplier-specific names (e.g., "Tub Parts" vs "Basket and Tub") are normalized to the Encompass canonical name, preventing duplicate entries in the final database.
