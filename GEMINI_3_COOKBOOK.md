# RoadrunnerParts: Gemini 3 Agentic Cookbook

This cookbook defines high-performance "recipes" for combining Gemini 3's advanced features with the RoadrunnerParts technical stack.

## 1. The "Visual Loop" Recovery (403/429 Bypass)
**Goal**: Automatically navigate past security gates or dynamic UI blocks on supplier sites.

### Tools Combination
- **Built-in**: `Computer Use` (Screenshot + Analysis)
- **Custom**: `save_agent_instruction` (Persist bypass logic), `log_telemetry` (Audit trail)
- **Model**: `gemini-3.1-flash-lite-preview` (Optimized for vision/speed)

### Recipe
1.  **Detection**: The `browser-agent` detects a `403 Forbidden` or a "Wait" screen.
2.  **Visual Analysis**: Gemini takes a screenshot via `Computer Use`.
3.  **Thinking Stage**: Use the "Thinking" process to identify the nature of the block (e.g., "Captcha found", "Cloudflare Challenge").
4.  **Bypass Action**: 
    - If Captcha: Prompt the Human-in-the-Loop (HITL) via the Cockpit.
    - If UI Popup: Use `Computer Use` to click the 'X' or 'Close' button.
5.  **Self-Correction**: Gemini generates a new `Agent Instruction` string (e.g., `"Wait for element .captcha-overlay to disappear then click #close-modal"`) and calls `save_agent_instruction`.
6.  **Retry**: Re-trigger the extraction with the updated instructions.

---

## 2. The "Market-Signal Intelligence" Pipeline
**Goal**: Generate high-conversion eBay listings with deterministic pricing data.

### Tools Combination
- **Built-in**: `Google Search` (Real-time eBay Sold prices), `Code Execution` (Python analysis)
- **Custom**: `get_part_market_signal` (Neon history), `create_channel_listing` (eBay API/DB)
- **Model**: `gemini-3-flash` or `gemini-3-pro` (Structured Output)

### Recipe
1.  **Data Gathering**: 
    - Parallel call to `get_part_market_signal` for internal sales history.
    - Parallel call to `Google Search` with query: `site:ebay.com "part_number" sold`.
2.  **Analysis**:
    - Pass search results and history into `Code Execution`.
    - Run a Python script to calculate the **7-day Moving Average Price**, **Shipping Cost variability**, and **Net Profit Margin**.
3.  **Synthesis**:
    - Gemini uses "Thinking" to decide the `age_band` based on `serial_decoder` results.
4.  **Output**: Generate a Zod-validated `channel_listing` object with an SEO-optimized title and price.

---

## 3. The "CoVe Autonomous Delta-Scan"
**Goal**: Verify BOM completeness and trigger targeted re-scans for missing systems.

### Tools Combination
- **Built-in**: `URL Context` (Ingest PDF Manuals)
- **Custom**: `verifyBomCompleteness` (JS Logic), `runTargetedBomRecovery` (Scraper)
- **Model**: `gemini-3.1-flash-lite-preview` (Domain Reasoning)

### Recipe
1.  **Review**: After a raw extraction, run `verifyBomCompleteness`.
2.  **Gap Identification**: If `coverageRatio < 0.95`, Gemini compares the current `model_parts_raw` against `appliance_architecture_prompt` hints (e.g., "Washer is missing Agitator assembly").
3.  **Grounding**:
    - If a manual URL is available, use `URL Context` to verify if the missing parts actually exist for this specific variant.
4.  **Recovery**: 
    - Call `runTargetedBomRecovery` with a specific focus on the identified missing system (e.g., `"Focus on the 'Agitator and Drive' assembly diagram"`).
5.  **Merge**: Re-run reconciliation to update the "Truth Score".

---

## 4. The "Schema-Aware Agent" (Self-Healing)
**Goal**: Ensure agents can ingest new data points without manual schema updates.

### Tools Combination
- **Built-in**: `Thinking`
- **Custom**: `compare_database_schema` (Neon), `prepare_database_migration` (Neon)
- **Model**: `gemini-3-pro` (Code writing)

### Recipe
1.  **Discovery**: Agent discovers a new valuable attribute (e.g., "Compatibility: R600a Refrigerant") during extraction.
2.  **Impact Analysis**: Gemini "Thinks" about where this belongs in the `part_inventory` table.
3.  **Migration**:
    - Call `compare_database_schema` to verify current state.
    - Call `prepare_database_migration` with SQL: `ALTER TABLE part_inventory ADD COLUMN refrigerant_type TEXT;`.
4.  **Code Update**:
    - Gemini uses `replace_file_content` to update `src/server/db/schema.ts` (Drizzle/Zod) to include the new field.
5.  **Validation**: Run `npm run typecheck` to ensure zero-downtime compatibility.

---

## 5. Summary of Key Implementation Patterns

| Pattern | Benefit | Key Gemini 3 Feature |
| :--- | :--- | :--- |
| **Atomic Instruction Patching** | Fixes scrapers in real-time without redeploy. | `save_agent_instruction` + `Thinking` |
| **Parallel Truth-Fetching** | Faster market pricing and MSRP lookups. | `Parallel Function Calling` |
| **Grounding via Manuals** | Prevents "Hallucinated Parts" in the BOM. | `URL Context` + `CoVe` |
| **HITL Decision Support** | High-integrity approval flow for risky actions. | `Structured Output` (Approval Schema) |

> [!TIP]
Always use `gemini-3.1-flash-lite-preview` for high-frequency extraction tasks to minimize latency and token costs while maintaining strong vision capabilities.
