# Agent Manager Instruction

## Pre-Execution Protocol (RDEP)
Before any search, browser, or extraction tool is called:

1. **Identity Gate (Pruning)**
   - Extract the Brand and ModelID from the prompt or log history.
   - Hard Lock: disable all domain-specific tools or searches that do not match the locked Brand.
   - If `Brand == LG`, immediately block any execution involving `samsung`, `bosch`, `hisense`, or `encompass` domains.

2. **Cache-First Mandate (Log Mining)**
   - Query the Project Logs first and treat existing logs as the primary database.
   - Deduplicate existing `partNumber` entries for the locked `ModelID`.
   - If a `Complete Pass` was attempted previously, only target the `Delta` missing sections.

3. **Direct-Path Extraction**
   - Bypass search engines.
   - Use the Source of Truth URL from the logs and navigate directly to relevant assembly sub-pages to fill gaps.

4. **Deterministic Output**
   - Merge cached parts and new parts into a single valid JSON object.
   - Do not provide prose; return JSON only.

## Gemini Model, Temperature & Reliability Policy

For Gemini agents, **keep temperature at default 1.0** unless the operator explicitly changes it for a run.

Roadrunner has two AI lanes:

- **Evidence automation lane**: BOM extraction, source review, nameplate OCR, supplier routing, listing-material generation, and any workflow that claims facts needed to post to eBay. Default to `gemini-3.1-flash-lite-preview` unless the operator explicitly selects another Gemini model for that run.
- **Office editor lane**: Frontend/back-office editing tools where an operator changes listing text, layout, wording, or review fields on the fly. Expose full Gemini API model selection to the operator.
- Provider is Gemini-only by default in both lanes.
- Operators may select any Gemini API model ID enabled for the project key, including stable, preview, latest, and experimental Gemini IDs.
- Image/visual editor tools may use image-capable Gemini models such as Nano Banana / Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) when the operator selects them.
- Custom model IDs are allowed when they start with `gemini-`.

Do not silently switch models. Any non-default model run must be explicit in saved agent input/config and remain visible in logs or run metadata.

- **Do not create a Temp-0 frontline agent.** 
- Reliability must come from narrow tool exposure, mode `ANY` for required calls, explicit `allowed_function_names`, flat schemas, Zod validation, deterministic DB writes, and completion gates.
- **Fallback Protocol:** Fallback means a narrower repair prompt, tighter schema, reduced `allowed_function_names`, or operator-selected Gemini model change. Model changes must be operator-approved and never automatic. Any non-default model run is logged by `model-runner` with model, stage, and reason. Evidence automation truth rules are unchanged regardless of model: non-default model output is not source evidence.
- **Exceptions:** Only use a low temperature if testing proves a specific Gemini model/stage benefits from it. Do not apply Temp-0 as a general reliability mechanism.

## Frontline vs Fallback Configuration

**Recommended Frontline Setup:**
- Model: `gemini-3.1-flash-lite-preview` (default — use this unless a specific stage requires otherwise)
- Temperature: `1.0` (Default)
- Mode: `ANY` (for required calls)
- Allowed Functions: Stage-specific only
- Purpose: Choose the next required function call

**Recommended Fallback Setup:**
- Model: operator-selected Gemini model ID; use `gemini-3.1-flash-lite-preview` when no explicit selection is provided
- Temperature: `1.0` (Default)
- Mode: `ANY` or `AUTO` by stage
- Allowed Functions: Narrowed to repair tools only
- Purpose: Recover from ambiguity, schema failure, or repeated failed tool calls
- Requirement: Any non-flash-lite run must be explicitly set in `agentConfig.model` and will be logged automatically with model, stage, and reason

**Final Response Agent Setup:**
- Temperature: `1.0` (Default)
- Mode: `NONE`
- Purpose: Summarize state without calling tools
