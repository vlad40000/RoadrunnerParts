# Standard Operating Procedure: Agentic BOM Extraction Pipeline

## 1. Objective
This document outlines the standard operating procedure for extracting Bill of Materials (BOM) data from diverse appliance parts suppliers (e.g., D&L Parts Co, Encompass). The goal is to enforce consistent, source-labeled naming conventions for all retrieved BOM JSON artifacts to prevent data overlap and maintain clean audit trails across different agents.

---

## [PROCESS SYSTEM DIRECTIVE]

```xml
<shard_initialization_protocol>
CRITICAL DIRECTIVE: You are operating in a stateless RALPH loop. You must re-establish your
baseline expertise before executing any Phase.

1. THE PRE-FLIGHT READ: Before processing a user request, executing Phase 0, or executing
   Phase 1A, you must read the central shard repository located at `./promoted-rules.md`
   (and/or read any files explicitly linked via [[wikilinks]] in the user's prompt).
2. CONTEXT INJECTION: You must extract the active "Micro-Memory Shards" from these files.
3. THE SHADOW PROMPT: You must dynamically append these shards to the VERY BOTTOM of your
   active execution prompt, wrapped in <critical_memory_shard> tags.
4. ABSOLUTE AUTHORITY: Shards represent empirically hardened "Golden Path" rules. If a Shard
   conflicts with your baseline knowledge or a general instruction, the Shard is the absolute,
   overriding source of truth.
</shard_initialization_protocol>
```

---

## 2. File Naming Conventions & Data Organization
To ensure data integrity and prevent cross-contamination between different suppliers, all extracted BOM JSON files MUST strictly adhere to the following naming format:

**`{ProviderName}_BOM_{ModelNumber}.json`**

### Examples:
- **D&L Parts Co**: `DLParts_BOM_HTDX100ED3WW.json`
- **Encompass**: `Encompass_BOM_HTDX100ED3WW.json`

### Partial Extractions:
If a script only extracts a subset of the BOM (e.g., a single diagram instead of the entire unit), it must be labeled explicitly:
- `DLParts_BOM_HTDX100ED3WW_Partial.json`

## 3. Provider-Specific Extraction Methodologies

### 3.1. Encompass
**Architecture**: Modern Next.js App Router (React Server Components).
**Strategy**: Native RSC Payload Parsing.

1. **Resolution**: Do not attempt to query a hidden autocomplete API. Send a standard GET request to `https://encompass.com/search?searchTerm={model_number}`. Follow the 302 Redirect to reach the canonical model page.
2. **Extraction**: **DO NOT use standard DOM scraping (e.g., BeautifulSoup on HTML elements).** The parts list is not rendered in the standard DOM tree.
3. **Parsing**: Extract the React Server Component (RSC) payload embedded within the main HTML `<script>` tags, specifically targeting `self.__next_f.push`. Parse this payload as JSON to recover the native part data.
4. **Tooling**: Use the provided `fetch_encompass.py` script.

### 3.2. D&L Parts Co
**Architecture**: Traditional SSR with obfuscated cross-origin iframes.
**Strategy**: Iterative Diagram Scraping.

1. **Resolution**: The base lookup URL typically only provides parts for the first diagram.
2. **Extraction**: You must iterate through all available diagram endpoints to capture the entire BOM.
3. **Tooling**: Use the provided `extract_dlparts_bom_all.py` script to scrape the full multi-diagram BOM.

## 4. Agent Collaboration Rules

When undertaking a new BOM extraction task, agents MUST follow these steps:
1. **Pre-Flight**: Check `WORKFLOW_STATE.md` to ensure the requested extraction hasn't already been completed.
2. **Execution**: Run the appropriate provider script passing the target `model_number` via CLI arguments.
3. **Validation**: Ensure the output JSON file correctly adheres to the naming convention defined in Section 2.
4. **Handoff**: Update `WORKFLOW_STATE.md` in the "BOM Extraction" section, documenting the status, source URL, output file name, and total part count extracted.

## 5. Source of Truth Boundary
As defined in the agent session startup rules:
- Final OEM part rows, part numbers, and completeness claims must come strictly from provider evidence (captured JSON, RSC payloads, XHR, etc.).
- Agents must not treat architecture prompts as source evidence for BOM composition.

## 6. RALPH Loop & Token Thermostat Rules

This pipeline operates as a **stateless RALPH loop** (Read → Act → Lock → Promote → Handoff). Every agent session is disposable; state lives in files, not context.

### 6.1. Session Startup Sequence (Mandatory)
1. Read `promoted-rules.md` — extract and inject all `[SHARD: ...]` entries as `<critical_memory_shard>` tags.
2. Read `WORKFLOW_STATE.md` — establish current pipeline state.
3. Read `RULE.md` and `.agents/policies/session-start.md` if present.
4. Acknowledge loaded shards to the terminal before executing any Phase.

### 6.2. Token Thermostat: Promoting New Shards
When an agent discovers a recoverable error, a hardware-specific handling rule, or a "Golden Path" deviation:
1. **Capture**: Document the exact failure mode and the correct action.
2. **Format**: Write it as `[SHARD: Category] Rule text.`
3. **Promote**: Append it to `promoted-rules.md`.
4. **Effect**: The next RALPH loop spin-up automatically injects the new shard, preventing the error from recurring.

### 6.3. Shard Format
```
[SHARD: Category] Single, actionable rule. No ambiguity.
```

### 6.4. Initialization Terminal Command
To start a session and verify shard loading:
```
Antigravity, initialize the Zero-Click eBay Engine. Run your <shard_initialization_protocol>
by reading promoted-rules.md. Acknowledge that you have loaded the Shards into your active
memory, output the Shards you found to the terminal, and tell me when you are ready to
process Phase 0.
```
