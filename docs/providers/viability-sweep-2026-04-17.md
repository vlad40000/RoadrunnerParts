# Provider Viability Sweep - 2026-04-17

## Product-Page Grounding Ranking
1. **Certified Appliance Parts**
2. **AppliancePartsPros**
3. **PartSelect**
4. **eReplacementParts**
5. **Repair Clinic**

## Grouped Model BOM Ranking
1. **Sears PartsDirect**
2. **PartSelect**
3. **Parts Dr**
4. **Reliable Parts**
5. **AppliancePartsPros**

## Provider Roles
- **Sears PartsDirect**: `primary_diagram`
- **PartSelect**: `primary_diagram`
- **Parts Dr**: `fallback_diagram`
- **AppliancePartsPros**: `fallback_diagram`
- **Reliable Parts**: `fallback_diagram`
- **Repair Clinic**: `fallback_diagram`
- **eReplacementParts**: `fallback_diagram`
- **Certified Appliance Parts**: `product_only`
- **A-1 Appliance Parts**: `product_only`
- **HD Supply**: `ignore`

## Key Correction
Easy product-page grounding is not the same as easy grouped model-to-diagram-to-parts grounding.
- **Group A (Product Logic)**: Grounding via Schema/JSON-LD for inventory/price.
- **Group B (Diagram Logic)**: Grounding via Diagram Groups for BOM compilation.

Locked roles are required before starting the Next Gen BOM pipeline refactor.
