# Build Rules for Profix Parts Finder

## Agent Session Startup (STRICT)
At the start of every session, agents MUST read `AGENTS.md`, `WORKFLOW_STATE.md`, and `.agents/policies/session-start.md` before making code changes or running extraction workflows.

For BOM extraction, browser-agent, or CoVe work, agents MUST also read `browser-agent/cove-reviewer-prompt.mjs` and `browser-agent/cove-verifier.mjs`.

The CoVe reviewer prompt is a coverage-review tool only. It must not be used to generate final source-of-truth BOM rows, OEM part numbers, prices, or completeness claims without provider/manual/database evidence.

## Model Configuration (STRICT LOCK)
You MUST use these specific Gemini models. **DO NOT change these identifiers under any circumstances unless explicitly instructed by the USER.**

- **Gemini 3 Pro Preview (`gemini-3-pro-preview`)**: Use for complex planning, system architecture, and exhaustive search-grounded BOM queries.
- **Gemini 3 Flash Preview (`gemini-3-flash-preview`)**: Use for high-velocity code generation, nameplate OCR, and identity review.

> [!IMPORTANT]
> **NO UNAUTHORIZED MODEL CHANGES**: Changing the model strings in `lib/gemini.js` or elsewhere to any older versions (1.5, 2.0, etc.) is STRICTLY PROHIBITED.

## Core Technical Stack
- **Framework**: [Next.js](https://nextjs.org) using **App Router** and **React Server Components (RSC)**.
- **Runtime**: Target **Vercel Edge Runtime** for all API logic and serverless functions.
- **Database**: Strictly use **Neon (Serverless Postgres)** with the `@neondatabase/serverless` driver.
- **Styling**: Exclusively use **Tailwind CSS** for rapid, responsive UI development.


## Prompt Boundary Rule (STRICT)
The `seededProvider` is a deterministic source provider and MUST NEVER invoke model prompting. PROMPT_ENGINEERING_STANDARD.md applies only when a model is asked to extract or audit BOM data from unstructured HTML/text. Seed rows must be replayed exactly as stored, with no inferred parts, no generated assemblies, and no model-expanded section coverage.

## Prompt Engineering Rubric (STRICT)
Before modifying any file under `src/features/bom/prompts`, grade the prompt against `.agents/policies/prompt_engineering_rubric.md`. Do not ship prompts that fail any mandatory requirement or hard-fail trigger.

### Seeded Provider Emission Rules:
- **provider_part_seed_rows** → one `RetrievedSource` per section with `ROW|` lines.
- **provider_assembly_sections** → one `RetrievedSource` per section with `NO_PART_ROWS: TRUE`.
- **provider_model_routes only** → one `route_only` source with `NO_PART_ROWS: TRUE`.
