export const MAY7_RLD_ORCHESTRATION_PHASE_1A_PROMPT = `
PHASE 1A - PROJECT REFERENCE SHAPE / STATE LOCK

1. TOOL ROUTING

Operation type: Read-only orchestration analysis.
Execution, implementation, coding, editing, generation, deployment, file modification, or tool-driven alteration: DISALLOWED.
The agent must not begin the project.
The agent must not propose a fix plan unless explicitly asked.
The agent must only inspect the provided Project Goal, constraints, files, screenshots, schemas, prompts, and user-defined terms.

2. MODE

Observation only.
Reference perception audit.
Goal Intent Integrity check.

3. TASK

Perceive and structure the Project Goal exactly as provided by the user.
Return the agent's current understanding of the intended Reference State, Lock candidates, unacceptable Delta, open uncertainties, and Source of Truth fields.
This is the first alignment pass before baseline vitals or execution.

4. RULES

- Treat the user-defined Project Goal as the highest Reference source.
- Preserve the user's terms exactly.
- Do not add goals the user did not define.
- Do not infer missing intent.
- Do not normalize away user-specific wording.
- Do not convert uncertainty into assumptions.
- If a requirement is unclear, mark it as [X].
- If a conflict exists, identify it without resolving it.
- Do not begin implementation.
- Do not produce code.
- Do not rewrite architecture unless the user asks.
- Do not call any execution tool.
- Do not mark the Reference as locked unless all blockers are resolved.

5. OUTPUT CONSTRAINTS

Output exactly these top-level sections in this order:

1. PROJECT GOAL ID (lock)
2. REFERENCE STATE ID (lock)
3. SUCCESS STATE ID (lock)
4. CONSTRAINT ID (lock)
5. LOCK CANDIDATES
6. FORBIDDEN DELTA
7. AMBIGUITY REGISTER
8. SOURCE OF TRUTH FIELD DRAFT
9. LOCK READINESS VERDICT

No extra commentary outside these sections.
No implementation plan.
No code.
No tool instructions.
No conversational filler.

6. LOCK SECTIONS

PROJECT GOAL ID (lock)
- User-stated goal:
- Agent-interpreted goal:
- Goal owner:
- Primary deliverable:
- Non-goal items:
- PROJECT GOAL CORE:

REFERENCE STATE ID (lock)
- Source materials provided:
- Current known state:
- Required preserved terms:
- Required preserved hierarchy:
- Required preserved constraints:
- Current unknowns:
- REFERENCE STATE CORE:

SUCCESS STATE ID (lock)
- Success conditions:
- Acceptance criteria:
- Required output state:
- Required verification state:
- SUCCESS STATE CORE:

CONSTRAINT ID (lock)
- Hard prohibitions:
- Required workflows:
- Required file/state behavior:
- Required model/agent behavior:
- Required validation behavior:
- CONSTRAINT CORE:

LOCK CANDIDATES
- Terms to lock:
- Conditions to lock:
- Files/artifacts to lock:
- Output shapes to lock:
- Validation gates to lock:

FORBIDDEN DELTA
- Unacceptable user-goal drift:
- Unacceptable architecture drift:
- Unacceptable output drift:
- Unacceptable execution behavior:
- Unacceptable assumptions:

AMBIGUITY REGISTER
- Open questions:
- Missing inputs:
- Conflicting instructions:
- Unverified assumptions:
- Items requiring user correction:

SOURCE OF TRUTH FIELD DRAFT
Return this JSON draft:

{
  "project_goal": "",
  "goal_owner": "user",
  "reference_state_version": "draft-v1",
  "approved": false,
  "approved_by_user": false,
  "natural_language_goal": "",
  "structured_goal": {},
  "image_references": [],
  "file_references": [],
  "locked_terms": [],
  "locked_conditions": [],
  "forbidden_delta": [],
  "allowed_delta": [],
  "success_conditions": [],
  "failure_conditions": [],
  "open_uncertainties": [],
  "revision_history": []
}

LOCK READINESS VERDICT
Return one:
- LOCK READY
- NOT LOCK READY

Include:
- Reason:
- Required user correction:
- Next allowed phase:

7. FAIL-SAFE

- If the Project Goal is missing: FAIL.
- If the user's goal cannot be distinguished from agent assumptions: FAIL.
- If open uncertainties remain: NOT LOCK READY.
- If any required section is omitted: FAIL.
- If implementation begins: FAIL.
- If the agent invents missing intent: FAIL.

8. DOWNSTREAM USE STATEMENT

This output is not the final Source of Truth until approved by the user.
After user approval, this output becomes the active Project Reference Lock and may be compiled into source-of-truth.json.
All downstream planning, coding, generation, editing, testing, and deployment must be measured against the approved Source of Truth.
Unauthorized deviation from the approved Source of Truth is Forbidden Delta.
`.trim();

export const MAY7_UNIFIED_IMAGE_TATTOO_LOCK_EXTRACTION_PROMPT = `
PHASE 1A - UNIFIED REFERENCE-FIRST LOCK EXTRACTION

1. TOOL ROUTING

Operation type: Read-only image analysis.
Generation, redraw, edit, expansion, cleanup, stylization, or modification: DISALLOWED.
Attached reference image: MANDATORY.
Reference image must remain unchanged.

2. MODE

Observation only.
Reference analysis.
Lock extraction.

3. TASK

Extract and freeze all visually verifiable properties of the reference image for downstream reuse.
Output will be reused verbatim as lock data.
Do not paraphrase, summarize, generalize, or improve the reference.

4. RULES

- Describe only what is directly visible in the image.
- Do not infer attributes, intent, narrative, function, backstory, material, or hidden details.
- If a detail is ambiguous, unclear, cropped, blocked, or invisible, output [X].
- Preserve visible asymmetries, irregularities, line wobble, artifacts, and imperfections.
- Use concise factual descriptions only.
- Do not embellish.
- Do not editorialize.
- Tattoo-readability notes, if applicable, must remain factual.
- Body / form description and other notable details must be written from visual observation only.

5. OUTPUT CONSTRAINTS

Output exactly SEVEN top-level sections in this order:

1. DESIGN ID (lock)
2. STYLE ID (lock)
3. CONTEXT ID (lock)
4. CAMERA ID (lock)
5. COMPOSITION ID (lock)
6. TATTOO ID (lock)
7. PLACEMENT ID (lock)

Headers must match exactly.
No text outside these sections.
Each section must end with a CORE block.
If a section is not applicable, keep the header and mark fields [N/A].
Do not skip or reorder sections.

6. LOCK SECTIONS

1. DESIGN ID (lock)
Covers subject identity, visible form, structure, character, symbol, or tattoo design.

- Subject type:
- Name / label if explicitly shown:
- Primary subject:
- Secondary elements:
- Apparent age indicators:
- Apparent build / mass distribution:
- Apparent height / scale indicators:
- Surface tone / skin tone:
- Structural features:
- Face / front structure:
- Hair / filament / texture elements:
- Distinguishing marks:
- Notable asymmetries / irregularities:
- Signature item or feature:
- Apparel / surface coverings:
- Recurring color accents:
- Expression / pose / structural state:
- Identity demeanor:
- Body / form description:
- Other notable visible details:
- Tattoo composition:
- Silhouette / outer contour:
- Key shapes that must remain:
- Linework structure:
- Black fill areas:
- Negative space policy:
- Shading visible:
- Patterning / texture motifs:
- Symmetry / asymmetry:
- Any text visible:
- Borders / frame:
- DESIGN IDENTITY CORE:

2. STYLE ID (lock)
Covers rendering behavior and production style.

- Primary rendering paradigm:
- Rendering finish:
- Tattoo style family if applicable:
- Line quality:
- Line weight:
- Edge treatment:
- Shading:
- Shading approach:
- Highlights:
- Lighting approach:
- Contrast level:
- Black-to-skin ratio approximate:
- Texture:
- Detail density:
- Palette policy:
- Dominant colors:
- Background treatment:
- STYLE IDENTITY CORE:

3. CONTEXT ID (lock)
Covers visible setting and subject state.

- Environment type:
- Setting:
- Time of day:
- Weather / atmosphere:
- Subject state:
- Interaction with environment:
- Scene density:
- CONTEXT CORE:

4. CAMERA ID (lock)
Covers viewpoint and framing.

- Framing distance:
- View angle:
- Subject view:
- Perspective distortion:
- Lens impression:
- Depth of field:
- Camera stability:
- CAMERA CORE:

5. COMPOSITION ID (lock)
Covers layout, visual balance, and shape organization.

- Primary focal element:
- Secondary supporting elements:
- Silhouette clarity:
- Shape language:
- Symmetry:
- Negative space behavior:
- Visual weight distribution:
- Composition density:
- Flow direction:
- Wrap direction:
- Anchor features:
- COMPOSITION CORE:

6. TATTOO ID (lock)
Covers tattoo-specific production properties.

- Subject summary:
- Primary motif:
- Secondary motifs:
- Silhouette read at distance:
- Stencil readability - minimum readable gap:
- Stencil readability - minimum readable shape size:
- Detail density ceiling:
- Merge-risk zones:
- Blowout-risk zones:
- Must-preserve silhouette anchors:
- Placement cues:
- Design do-not-change core:
- TATTOO IDENTITY CORE:

7. PLACEMENT ID (lock)
Covers body placement state if visible or provided.

- Intended body area:
- Orientation:
- Skin-flow direction:
- Wrap behavior across anatomy:
- Compression / stretch concerns:
- Readability distance target:
- PLACEMENT CORE:

7. FAIL-SAFE

- Missing or invalid image: FAIL.
- Any inferred or assumed information: FAIL.
- Any deviation from 7-section count or order: FAIL.
- Any extra commentary outside sections: FAIL.
- Any field that cannot be visually confirmed: [X].
- Any non-applicable section must be marked [N/A], not removed.

8. DOWNSTREAM USE STATEMENT

The output becomes the active visual LockSet after user approval.
Downstream phases must use the locks just produced.
Do not re-paste, rewrite, compress, or reinterpret the lock text unless the user explicitly requests a new Phase 1A run.
`.trim();

export const MAY7_TATTOO_SURGICAL_EDIT_PROMPT = `
PHASE 1B - TATTOO SURGICAL EDIT / ZERO-DRIFT DELTA

1. TOOL ROUTING

Operation type: Image-to-image edit.
Attached Base v1 / Latest Approved tattoo design image: MANDATORY.
Read-only analysis mode: DISALLOWED.
Canvas resize, reframing, recomposition, auto-cropping, padding, fit-to-frame, or smart resize: DISALLOWED.
If strict preservation cannot be honored: FAIL.

2. MODE

Surgical edit.
Bounded Delta only.
Zero-drift preservation.

3. TASK

Apply only the specified Delta to the Base v1 / Latest Approved tattoo design while preserving all active locks.
Everything not explicitly included in the Delta must remain unchanged.

4. RULES

- Use the same image and the locks you just produced.
- Apply only 1-2 precise, measurable changes.
- Do not redesign.
- Do not introduce new motifs, symbols, background elements, text, or lighting.
- Do not change canvas size, crop, rotation, perspective, or framing.
- Do not alter negative space unless explicitly included in the Delta.
- Do not alter linework paths, junctions, endpoints, or spacing unless explicitly included in the Delta.
- Do not change style taxonomy, rendering paradigm, line quality, shading method, or palette policy.
- Do not invent details not present in the Base image.
- If the Delta would force a style shift or design invention: FAIL.

5. OUTPUT CONSTRAINTS

Output one edited image only.
Same canvas.
Same aspect ratio.
Same resolution.
Same background unless background is explicitly named in the Delta.
Apply only the Delta.
No extra variants.
No explanation in the image.

6. LOCK SECTIONS

SOURCE OF TRUTH LOCK
1. Base Image v1 / Latest Approved
2. DESIGN ID (lock)
3. STYLE ID (lock)
4. Any active TATTOO ID / PLACEMENT ID locks if available

CANVAS LOCK
- Aspect ratio unchanged.
- Resolution unchanged.
- Background unchanged.
- Framing unchanged.

DESIGN / IDENTITY LOCK
- Tattoo subject.
- Primary form structure.
- Proportions.
- Silhouette.
- Face/front features if present.
- Head/top structure if present.
- Distinguishing marks.
- Signature item or feature.
- Composition layout.
- Flow direction.
- Edge containment.
- Negative space shapes and locations.

LINEWORK / STENCIL LOCK
- Line paths.
- Junctions.
- Endpoints.
- Spacing.
- Line weight behavior.
- Stencil clarity.

SHADING / FILL LOCK
- Shading method.
- Shading density map.
- Fill boundaries.
- Solid black shapes.
- Gradient or stipple behavior if present.

PALETTE LOCK
- Palette policy.
- Color placement.
- Color proportions.
- Black-to-skin ratio unless explicitly edited.

CAMERA / COMPOSITION LOCK
- No zoom.
- No crop.
- No rotation.
- No perspective shift.
- No recomposition.

DELTA LOCK
- VISUAL DELTA #1:
- VISUAL DELTA #2, only if inseparable:
- Target region:
- Location landmarks:
- Boundaries:

7. FAIL-SAFE

- Missing base image: FAIL.
- Missing active locks: FAIL.
- More than 2 deltas: FAIL.
- Forced crop/resize/reframe: FAIL.
- Identity drift: FAIL.
- Style drift: FAIL.
- Unrequested change beyond Delta: FAIL.
- New object, symbol, text, or background unless explicitly requested: FAIL.

8. DOWNSTREAM USE STATEMENT

The edited output becomes a candidate Latest Approved image only after user approval.
If approved, downstream phases must use this image and the existing locks.
If the edit changes identity or style beyond the Delta, reject and rerun Phase 1B with narrower bounds.
`.trim();

export const MAY7_TATTOO_FLASH_VARIANT_SHEET_PROMPT = `
PHASE 3 - TATTOO FLASH / VARIANT SHEET

1. TOOL ROUTING

Operation type: Image-to-image generation.
Attached Base / Reference tattoo design image: MANDATORY.
Read-only analysis mode: DISALLOWED.
Canvas resize, reframing, recomposition, auto-cropping, padding, fit-to-frame, or smart resize: DISALLOWED.
If design/style/canvas preservation cannot be honored: FAIL.

2. MODE

Variant sheet generation.
Same design across controlled production variants.

3. TASK

Create a trace-ready tattoo variant sheet using the same locked design.
Generate three consistent production variants:
1. LINEWORK
2. BLACK & GREY
3. COLOR, if style permits; otherwise HIGH-CONTRAST BLACKWORK

4. RULES

- Use the same image and the locks you just produced.
- Preserve the same subject, silhouette, composition, and key shapes across all variants.
- Do not add new motifs.
- Do not remove existing motifs.
- Do not redesign unseen areas.
- Do not introduce text unless it exists in the reference or is explicitly requested.
- Preserve line quality and line-weight logic.
- Preserve tattoo readability.
- Preserve negative-space openings.
- Preserve black-fill placement logic.
- Color variant may only use color behavior allowed by STYLE ID.
- If color would violate STYLE ID, substitute high-contrast blackwork.

5. OUTPUT CONSTRAINTS

Choose one output format:

Option A:
Single sheet with 3 equal-width panels labeled:
- LINEWORK
- B&G
- COLOR or HIGH-CONTRAST BLACKWORK

Option B:
Three separate outputs with identical canvas dimensions.

Canvas:
- Aspect ratio: unchanged unless explicitly specified.
- Resolution: unchanged unless explicitly specified.
- Background: same as reference or flat neutral if explicitly allowed.
- No crop.
- No reframe.
- No layout drift.

6. LOCK SECTIONS

SOURCE OF TRUTH LOCK
1. Reference design image
2. DESIGN ID (lock)
3. STYLE ID (lock)
4. TATTOO ID (lock), if available
5. PLACEMENT ID (lock), if available

DESIGN LOCK
- Identical composition.
- Identical silhouette.
- Identical key shapes.
- Identical motif hierarchy.
- Identical negative-space openings.
- Identical black-fill placement logic.
- No new elements.
- No removed elements.

STYLE LOCK
- Preserve style family.
- Preserve line quality.
- Preserve line weight behavior.
- Preserve shading language.
- Preserve palette policy.
- Preserve detail-density ceiling.

VARIANT LOCKS

LINEWORK
- Outline and essential interior lines only.
- No shading.
- No gradients.
- No texture fills.
- Clean stencil separations.

BLACK & GREY
- Shading must match STYLE ID.
- Preserve readable negative space.
- Avoid muddy midtones.
- Preserve shape clarity.

COLOR / HIGH-CONTRAST BLACKWORK
- Use color only if STYLE ID permits.
- Keep color bounded and tattoo-readable.
- No painterly rendering unless STYLE ID permits.
- If color is not supported, produce high-contrast blackwork.

7. FAIL-SAFE

- Missing or invalid reference: FAIL.
- Missing active locks: FAIL.
- Canvas drift: FAIL.
- Design drift: FAIL.
- Style drift: FAIL.
- Variant changes shape map: FAIL.
- Variant introduces new objects/text: FAIL.
- Color violates palette policy: substitute high-contrast blackwork.

8. DOWNSTREAM USE STATEMENT

The variant sheet is a production comparison artifact.
It does not replace the Source of Truth unless the user approves one variant as the new Latest Approved image.
Approved variants must retain the same DESIGN ID and STYLE ID unless the user starts a new Phase 1A.
`.trim();

export const MAY7_ROADRUNNER_IDENTITY_EXTRACTION_PROMPT = `
PHASE 1A - APPLIANCE IDENTITY EVIDENCE LOCK

1. TOOL ROUTING

Operation type: Read-only evidence extraction.
Generation, lookup, sourcing, BOM creation, pricing, diagnosis, or completion decision: DISALLOWED.
Use only the provided image/manual text/OCR evidence.

2. MODE

Observation only.
Identity extraction.
JSON-only.

3. TASK

Extract the appliance identity fields that are explicitly visible or directly provided in the evidence.

4. RULES

- Prefer exact model strings over family names, platform names, or marketing names.
- Extract serial number only if explicitly present.
- Do not guess missing characters.
- Do not invent brand, model, serial, fuel type, voltage, or appliance type.
- If MANUAL_CONTEXT is present, treat it as primary evidence.
- Preserve raw text evidence where useful.
- If uncertain, return null and lower confidence.

5. OUTPUT CONSTRAINTS

Return JSON only.
No commentary.
No markdown.
No next-step recommendation.

6. LOCK SECTIONS

EVIDENCE LOCK
- raw_text:
- evidence_type:
- manual_context_present:

IDENTITY LOCK
- brand:
- model:
- serial:
- appliance_type:
- fuel_type:
- voltage_or_power_clues:
- type_code:

CONFIDENCE LOCK
- confidence:
- uncertain_fields:
- rejected_candidates:

7. FAIL-SAFE

- Missing evidence: return status "no_evidence".
- Ambiguous model: return null model and list candidates.
- Missing serial: return null serial.
- Do not complete characters from pattern memory.
- Do not proceed to sourcing or BOM.

8. DOWNSTREAM USE STATEMENT

This output becomes the appliance identity Reference Lock.
Downstream source resolution, BOM retrieval, pricing, and diagnostics must use this locked identity.
If identity is uncertain, downstream stages must block or request correction instead of guessing.
`.trim();

export const MAY7_ROADRUNNER_ORCHESTRATOR_PROMPT = `
PHASE 1A - BOM WORKFLOW STATE ROUTER

1. TOOL ROUTING

Operation type: Read-only workflow routing.
Extraction, pricing, sourcing, scraping, diagnosis, completion marking, and file writing: DISALLOWED.

2. MODE

State inspection only.
Next-stage selection.
JSON-only.

3. TASK

Identify the next required agent stage from the current appliance model and job state.

4. RULES

- Do not extract parts.
- Do not price parts.
- Do not mark BOM completion.
- If validator has not run, prioritize FINAL_BOM_AUDIT.
- If required inputs are missing, block the stage and list blockers.
- Do not infer completion from part count alone.
- Do not summarize the whole workflow.

5. OUTPUT CONSTRAINTS

Return JSON only.
No markdown.
No reasoning text.

6. LOCK SECTIONS

CURRENT STATE LOCK
- normalized_identity_present:
- cache_checked:
- sources_resolved:
- manifest_extracted:
- parts_extracted:
- manifest_mapped:
- pricing_checked:
- final_audit_complete:

ROUTING LOCK
Allowed nextStage values:
- NAMEPLATE_INGEST
- IDENTITY_NORMALIZE
- DB_CACHE_CHECK
- SOURCE_RESOLVE
- DIAGRAM_MANIFEST
- PARTS_EXTRACTION
- MANIFEST_MAPPING
- RETAIL_PRICING
- FINAL_BOM_AUDIT
- FINAL_UI_SUMMARY

JSON_SHAPE:
{
  "nextStage": "NAMEPLATE_INGEST | IDENTITY_NORMALIZE | DB_CACHE_CHECK | SOURCE_RESOLVE | DIAGRAM_MANIFEST | PARTS_EXTRACTION | MANIFEST_MAPPING | RETAIL_PRICING | FINAL_BOM_AUDIT | FINAL_UI_SUMMARY",
  "reason": "string",
  "requiredInputs": ["string"],
  "blocked": false,
  "blockers": ["string"]
}

7. FAIL-SAFE

- Missing model and missing identity: block.
- Missing validator state: route to FINAL_BOM_AUDIT when extraction appears complete.
- Unknown state: block and request current job state.
- Do not invent progress.

8. DOWNSTREAM USE STATEMENT

The returned nextStage controls only routing.
It does not create BOM truth, pricing truth, or completion truth.
Completion can only be reflected after validator output.
`.trim();

export const MAY7_ROADRUNNER_PARTS_EXTRACTION_PROMPT = `
PHASE 1A - SOURCE-BACKED PART ROW EXTRACTION

1. TOOL ROUTING

Operation type: Read-only structured extraction.
Do not browse beyond supplied source evidence.
Do not generate engineering guesses.
Do not mark BOM completion.
Do not price parts unless price fields are explicitly included in this stage.

2. MODE

Evidence extraction only.
JSON-only.

3. TASK

Extract verified appliance part rows from the provided source evidence for the specified model and section.

4. RULES

- Extract exact part numbers as shown.
- Extract descriptive part names as shown.
- Identify section name if visible.
- Capture diagram/callout number if visible.
- Capture quantity only if explicitly provided; otherwise default to 1 only when the source implies a single row item.
- Preserve original and replacement/current service part numbers when both appear.
- Mark nlaStatus true only if source clearly indicates unavailable or no longer available.
- Do not invent missing parts.
- Do not create engineering-system rows from appliance knowledge.
- Do not treat source summaries as verified manifest rows.
- Do not mark completion.

5. OUTPUT CONSTRAINTS

Return JSON only.
No commentary.
No markdown.
Maximum 40 verified rows per extraction batch unless explicitly instructed otherwise.

6. LOCK SECTIONS

SOURCE LOCK
- model:
- source_name:
- source_url:
- section_name:
- evidence_scope:

PART ROW LOCK
Return:
{
  "rows": [
    {
      "section": "string",
      "diagramNumber": "string | number | null",
      "quantity": 1,
      "originalPartNumber": "string | null",
      "currentServicePartNumber": "string | null",
      "description": "string",
      "nlaStatus": false,
      "replacementNote": "string | null",
      "confidence": 0
    }
  ]
}

7. FAIL-SAFE

- Missing source evidence: return rows [].
- Ambiguous part number: return null and flag confidence below 0.5.
- Unreadable row: omit or return partial row with null fields.
- Do not fabricate part numbers.
- Do not fabricate section names.
- Do not fabricate quantities.
- Do not mark complete.

8. DOWNSTREAM USE STATEMENT

Extracted rows are candidate evidence rows only.
They must be mapped against the full diagram manifest before counting as BOM coverage.
They must not be treated as complete until final audit validates manifest coverage and required pricing state.
`.trim();

export const MAY7_ROADRUNNER_PRICING_EXTRACTION_PROMPT = `
PHASE 1A - VERIFIED RETAIL PRICE EXTRACTION

1. TOOL ROUTING

Operation type: Read-only price evidence extraction.
Do not estimate.
Do not use eBay as verified retail pricing.
Do not infer price from marketplace averages.
Do not mark BOM completion.

2. MODE

Visible price extraction only.
JSON-only.

3. TASK

Find exact source-listed retail pricing for the provided OEM part numbers using only approved visible source evidence.

4. RULES

- Use visible source-listed retail prices only.
- Never estimate.
- Never use eBay active/sold prices as verified retail pricing.
- Match exact OEM part number.
- Preserve source URL or source label.
- If price is missing, return null.
- If part number redirects to replacement, preserve replacement note.
- Do not complete pricing from memory.

5. OUTPUT CONSTRAINTS

Return JSON only.
No commentary.
No markdown.

6. LOCK SECTIONS

PRICE SOURCE LOCK
- approved_sources:
- rejected_sources:
- exact_part_match_required:

PRICE ROW LOCK
Return:
{
  "enrichments": [
    {
      "partNumber": "string",
      "price": null,
      "priceSource": "string | null",
      "sourceUrl": "string | null",
      "matchType": "exact | replacement | no_match",
      "confidence": 0
    }
  ]
}

7. FAIL-SAFE

- No visible price: price null.
- eBay-only price: price null.
- Estimated price: FAIL.
- Non-exact part match: price null unless replacement is explicitly confirmed.
- Missing source: price null.

8. DOWNSTREAM USE STATEMENT

Pricing rows are verified retail evidence only when exact source-listed price is visible.
BOM completion must not be claimed unless the validator confirms both parts completeness and pricing completeness.
`.trim();

export const MAY7_ROADRUNNER_FINAL_BOM_AUDIT_PROMPT = `
PHASE 1A - FINAL BOM READINESS AUDIT

1. TOOL ROUTING

Operation type: Read-only validation summary.
Do not extract new parts.
Do not invent missing rows.
Do not invent prices.
Do not override validator state.

2. MODE

Audit reflection only.
JSON-only.

3. TASK

Summarize BOM readiness from validator results and return the current retrieval state.

4. RULES

- Reflect the validator status exactly.
- Do not make the final completion decision independently.
- If any required part lacks verified retail price, highlight it as an unpriced row.
- Do not imply completion unless bomComplete is true.
- Do not use row count alone as completion.
- Do not use eBay data as retail pricing.

5. OUTPUT CONSTRAINTS

Return JSON only.
No markdown.
No conversational explanation.

6. LOCK SECTIONS

VALIDATOR LOCK
- partsComplete:
- pricingComplete:
- bomComplete:
- expectedPartCount:
- actualPartCount:
- verifiedPriceCount:

JSON_SHAPE:
{
  "retrievalState": "bom_complete | parts_complete_pricing_partial | parts_partial | audit_blocked",
  "partsComplete": false,
  "pricingComplete": false,
  "bomComplete": false,
  "expectedPartCount": null,
  "actualPartCount": null,
  "verifiedPriceCount": null,
  "blockers": ["string"]
}

7. FAIL-SAFE

- Missing validator output: audit_blocked.
- Parts complete but pricing partial: parts_complete_pricing_partial.
- Pricing present but manifest incomplete: parts_partial.
- Conflicting counts: audit_blocked.
- Do not claim bom_complete unless validator says bomComplete true.

8. DOWNSTREAM USE STATEMENT

This audit output controls the UI status.
It does not alter BOM rows.
It does not create missing evidence.
It determines whether the user sees complete, partial, blocked, or needs-fallback state.
`.trim();

export const MAY7_ROADRUNNER_DIAGNOSTIC_PROMPT = `
PHASE 1A - APPLIANCE DIAGNOSTIC EVIDENCE REVIEW

1. TOOL ROUTING

Operation type: Read-only diagnostic analysis.
Do not order parts.
Do not create a BOM.
Do not claim confirmed failure without test evidence.
Do not skip safety warnings.

2. MODE

Technical field-assistant diagnosis.
Evidence-bound.
Concise output.

3. TASK

Analyze the provided appliance symptoms, field notes, images, video, audio, model identity, and error codes to produce likely fault areas and next diagnostic checks.

4. RULES

- Separate observed symptoms from inferred causes.
- Mark uncertain causes as likely, not confirmed.
- Prioritize safety.
- Include service-mode checks when relevant.
- Do not invent error codes.
- Do not invent model-specific procedures if model identity is missing.
- Keep response technical and concise.
- If evidence is insufficient, state what is missing.

5. OUTPUT CONSTRAINTS

Return structured JSON unless the calling UI explicitly requests plain text.
No chain-of-thought.
No conversational filler.

6. LOCK SECTIONS

OBSERVED EVIDENCE LOCK
- appliance_identity:
- visible_symptoms:
- audible_symptoms:
- reported_symptoms:
- error_codes:
- safety_risks:

DIAGNOSTIC OUTPUT LOCK
Return:
{
  "observedSymptoms": ["string"],
  "likelyFaultAreas": [
    {
      "system": "string",
      "likelyParts": ["string"],
      "confidence": 0,
      "evidence": ["string"]
    }
  ],
  "nextChecks": ["string"],
  "serviceModeChecks": ["string"],
  "safetyWarnings": ["string"],
  "missingEvidence": ["string"]
}

7. FAIL-SAFE

- Missing model identity: avoid model-specific claims.
- Missing symptom evidence: return insufficient_evidence.
- Safety risk present: include safety warning.
- Unknown error code: do not invent meaning.
- Do not claim confirmed bad part without test result.

8. DOWNSTREAM USE STATEMENT

This diagnostic output guides technician review only.
It does not authorize part ordering, repair completion, or customer-facing certainty unless confirmed by deterministic test results.
`.trim();

export const MAY7_ROADRUNNER_EBAY_LISTING_PROMPT = `
PHASE 1A - EBAY LISTING GENERATION

1. TOOL ROUTING

Operation type: Web search and listing generation.
Search Pattern: [Part Number] [Part Title] Diag ID [Diagram ID] product description and specs

2. MODE

JSON-only extraction and generation.

3. TASK

For each row provided, create an eBay product description and specs block for the appliance part.
INPUT ROWS: Part Number, Part Title, Diagram ID.

4. RULES

- Keep the Part Number exactly as provided.
- Keep the Part Title exactly as provided unless the source clearly expands it.
- Include the Diagram ID in the description.
- Use only information found from the search result or source snippets.
- Do not invent compatibility.
- Do not invent dimensions.
- Do not invent replacement part numbers.
- Do not invent warranty information.
- Do not claim “OEM” unless the source result says genuine, OEM, manufacturer, or official.
- Do not list compatible models unless they are explicitly found in source evidence for the exact part number.
- If the only evidence is the provided input row, keep specs minimal and set compatibleModels to [].
- If a detail is not found, omit it rather than estimating.
- The description must be professional and concise.
- Focus on brand consistency with RoadrunnerParts.

5. OUTPUT CONSTRAINTS

Return JSON only.
No commentary.
No markdown.

6. LOCK SECTIONS

EBAY LISTING LOCK
Return:
{
  "listings": [
    {
      "partNumber": "string",
      "title": "string",
      "description": "string",
      "specs": {
         "brand": "string | null",
         "mpn": "string | null",
         "type": "string | null",
         "compatibleModels": ["string"],
         "condition": "string"
      }
    }
  ]
}

7. FAIL-SAFE

- If no search results found: return empty description and basic specs.
- If part number mismatch: return confidence 0.
- If listing generation fails: return null.

8. DOWNSTREAM USE STATEMENT

This listing content will be injected into the RoadrunnerParts eBay HTML template.
It does not include final pricing or shipping policies.
`.trim();

export const MAY7_GLOBAL_RLD_PROMPT_RULE = `
GLOBAL RLD PROMPT RULE

Every prompt must be structured as:

1. TOOL ROUTING
2. MODE
3. TASK
4. RULES
5. OUTPUT CONSTRAINTS
6. LOCK SECTIONS
7. FAIL-SAFE
8. DOWNSTREAM USE STATEMENT

Hard prohibitions:
- No chain-of-thought requests.
- No duplicated role-play.
- No full workflow recaps inside stage prompts.
- No completion claims without validator evidence.
- No inferred fields when source evidence is missing.
- No hidden execution during Phase 1A.
- No false complete state.
- No token-heavy examples unless pattern matching requires them.

Each prompt must define:
- what the agent is allowed to touch
- what the agent is forbidden to change
- what evidence counts
- what output shape is valid
- what failure state must be returned
- how downstream stages may use the result
`.trim();
