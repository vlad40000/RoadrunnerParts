# Profix Parts Finder: Operator Manual

## Introduction
The Profix Parts Finder is a high-performance tool for extracting Bill of Materials (BOM) and verified retail pricing for appliances. While the system is designed to be highly automated, the **Distributor Control Panel** provides manual overrides for complex cases.

## Distributor Control Panel
The control panel is located below the model search input. It organizes suppliers into four tiers based on data fidelity and availability.

### Source Tiers
*   **Tier 0 (Intake & Priority)**: Direct URL intake, seeded providers, and primary partners like Encompass and PartsDr.
*   **Tier 1 (Core Distributors)**: Mainstream distributors including Sears PartsDirect and AppliancePartsPros.
*   **Tier 2 (Secondary Distributors)**: PartSelect, Fix.com, and RepairClinic.
*   **Tier 3 (Long-Tail Suppliers)**: Regional and specialized suppliers (e.g., Reliable Parts, Coast Appliance Parts).

### Manual Tasks
Each supplier row provides three primary actions:
1.  **Parts Diagrams**: Fetches all available assembly titles and diagram links. This is the first step if the model is not yet in cache.
2.  **Parts BOM**: Extracts the full parts list (Part Number, Description, Quantity) from the selected supplier. If an assembly is selected, only that assembly is extracted.
3.  **Pricing**: Triggers the retail pricing enrichment pipeline. 
    *   **Lock Rule**: Pricing is locked until the "Expected Parts Total" is met. If a job expects 100 parts but only has 80, you must find the missing parts from other diagrams or suppliers first.

## Workflow: Manual Retrieval
1.  **Identity**: Enter the model number and brand.
2.  **Open Tier**: Click a Tier button (e.g., Tier 1).
3.  **Fetch Diagrams**: Click "Parts Diagrams" for a reputable supplier.
4.  **Extract BOM**: Once diagrams are resolved, click "Parts BOM".
5.  **Price**: Once the part count matches the expected total, click "Pricing".

## Telemetry & Monitoring
All manual actions are logged for performance monitoring.
*   **Status Indicators**: 
    *   `idle`: Ready to start.
    *   `running`: Task is active in the background.
    *   `complete`: Task finished successfully.
    *   `failed`: An error occurred (check the error message in the UI).

## Troubleshooting
*   **403 Errors**: Some suppliers (like Sears) may block automated requests. If a task fails with a 403, try a different supplier or tier.
*   **Missing Parts**: If a supplier is missing parts, use the "Open" link to manually verify the website and then try another supplier in the control panel.
*   **Locked Pricing**: If pricing is locked, look at the "Issues" log to see which parts or diagrams are missing from the manifest.
