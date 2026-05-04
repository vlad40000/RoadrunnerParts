# RoadrunnerParts: Prompt Scenarios

These scenarios represent the core AI-driven workflows for appliance part management. Use these to build and test the prompt library.

## 1. Nameplate OCR & Identity Extraction
**Goal**: Convert a raw image of an appliance nameplate into structured JSON.
- **Input**: Image (JPG/PNG).
- **Target Fields**: `brand`, `model`, `serial`, `engineering_code`, `appliance_type`.
- **Nuance**: Must handle blurry text and distinguish between Model and Serial prefixes.

## 2. BOM (Bill of Materials) Recovery
**Goal**: Extract part numbers and descriptions from a provider's assembly page or manual.
- **Input**: HTML snippet or page screenshot.
- **Target Fields**: `part_number`, `description`, `diagram_position`, `qty`.
- **Nuance**: Must maintain the relationship between the part and its position on the exploded view diagram.

## 3. Part Classification & Criticality
**Goal**: Determine the functional role and replacement urgency of a part.
- **Input**: Part description and appliance type.
- **Target Fields**: `category` (Electrical, Mechanical, Cosmetic), `criticality` (1-5), `is_wear_item` (Boolean).
- **Nuance**: A "Belt" is critical for a dryer but "Cosmetic" for some other contexts.

## 4. Truth Source Reconciliation
**Goal**: Compare two sources of BOM data and identify the "Gold Truth".
- **Input**: List A (e.g., Encompass), List B (e.g., PartsDr).
- **Output**: Discrepancy log + Final consolidated list with confidence scores.
- **Nuance**: One source might have superseded part numbers that the other doesn't.

## 5. Supplier Price Analysis
**Goal**: Parse pricing and availability from multiple supplier results.
- **Input**: Search result snippets.
- **Target Fields**: `price`, `availability_status`, `shipping_time`.
- **Nuance**: Detect "Core Charges" vs "Retail Price".
