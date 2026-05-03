# BOM Extraction Pipeline Fixes

This plan outlines the specific steps required to correct the model usage, implement the Brand Source Gate, adjust search templates, and fix Zod parsing, as specified by the user's detailed feedback.

## Open Questions
- Is there an existing `brand_source_gate.ts` or similar utility, or should I place the new definitions inside `src/features/bom/registry/brand-source-gate.ts`? (I will assume creating `src/features/bom/registry/brand-source-gate.ts` is fine).
- Where exactly is the source-resolution prompt currently stored? I couldn't find a file strictly matching the source-resolution prompt text. If `src/features/bom/prompts/engine.ts` holds it, I'll update it there. (I'll add a step to locate it during execution).

## Proposed Changes

### Configuration & Runner Updates
#### [MODIFY] `src/features/bom/services/model-runner.ts`
- Add `lite` (or similar) to the `model?: "fast" | "pro" | "lite"` type in `ModelRunInput`.
- Update the model selection logic to map `"lite"` to `gemini-3.1-flash-lite-preview`.

### Low-Risk Stages Model Updates
#### [MODIFY] `src/features/bom/agents/identity-extractor.ts`
- Change `runStructuredJson` calls in `runIdentityExtraction` and `runIdentityNormalization` to explicitly pass `model: "lite"`.
- Use `IdentitySchema` (or `stage1OutputSchema` / `stage2OutputSchema` via `safeParse`) to robustly validate model output rather than blindly trusting the parsed JSON text. This fixes the issue of stringified JSON from the model.

### Brand Source Gate Implementation
#### [NEW] `src/features/bom/registry/brand-source-gate.ts`
- Define the `BrandFamily` and `SourceKey` types.
- Implement the `BRAND_SOURCE_GATE` record mapping brand families to approved sources.
- Add a helper function to resolve `approvedSources` and `forbiddenSources` based on `brand_family`.

### Grounding Search Templates Correction
#### [MODIFY] `src/features/bom/services/search/search-adapter.ts`
- Replace the current hardcoded search templates with the corrected, brand-aware templates for GE, Bosch, etc.
- Integrate the `Brand Source Gate` to filter which domains to query. This ensures Bosch domains are *only* queried for Bosch appliances.

### Source Resolution Prompt Update
#### [MODIFY] Source Resolver Prompt (Location TBD, likely `src/features/bom/prompts/contract.ts` or `engine.ts` or `parts.ts`)
- Overhaul the prompt to use the new XML-style format provided in the instructions.
- Ensure the `brand_source_gate` block is present and filled dynamically.
- Add the `SOURCE COMPATIBILITY RULE` to ensure the model bails out early if the brand doesn't match the OEM domain.

### Worker Flow Stages 5.1 & 5.2
- [ ] Create and run `scratch/test_pipeline.ts` for verification
- [ ] Implement `claimNextRetrievalJob` in `src/features/bom/services/retrieval-job-store.ts` using `FOR UPDATE SKIP LOCKED`
- [ ] Create `src/features/bom/services/retrieval-worker.ts` implementing the "Correct Worker Pattern"

## Verification Plan

### Automated Tests
- TypeScript build (`npm run build` or `tsc --noEmit`) to verify that the `BrandFamily`, `SourceKey`, and Zod parsing modifications are strongly typed.

### Manual Verification
- A dry-run of the orchestrator to confirm that a GE model doesn't generate `site:bosch-home.com` queries in the API logs.
- Review output logs to verify that `gemini-3.1-flash-lite-preview` is used for Identity Extractor steps, and `gemini-3-flash-preview` is preserved for BOM Mapping/Pricing.
