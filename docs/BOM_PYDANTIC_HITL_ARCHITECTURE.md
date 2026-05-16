# BOM Pydantic + Deterministic + Probabilistic + HITL Architecture

## Purpose

The appliance BOM system must stop relying on broad model prompts. The correct architecture is a typed, staged extraction pipeline with deterministic acquisition, programmatic parsing, bounded probabilistic extraction, and human review gates.

Core stack:

```text
Playwright capture
→ BeautifulSoup/Cheerio parser
→ Pydantic validation
→ deterministic confidence scoring
→ HITL review if needed
→ AI extraction only from approved section snapshots
→ DB writes
→ section progress rollup
```

---

## Operating Modes

### 1. Deterministic

Used for exact, repeatable logic:

```text
model normalization
provider routing
known URL resolution
HTML link extraction
section manifest parsing
part table parsing
pricing row parsing
DB upserts
state transitions
confidence scoring
```

Deterministic output is accepted automatically only if it passes schema validation and confidence thresholds.

### 2. Programmatic

Used for acquisition and extraction mechanics:

```text
Playwright page load
network capture
HTML snapshot
text snapshot
screenshot capture when needed
BeautifulSoup/Cheerio parse
regex fallback
link classification
section candidate construction
```

Programmatic tools create evidence, not final truth by themselves.

### 3. Probabilistic

Used only inside a bounded, evidence-backed task:

```text
AI receives one approved section snapshot
AI extracts part rows from that section only
AI must return typed JSON
Pydantic validates output
low-confidence rows go to HITL
```

AI may not invent sections, counts, prices, supersessions, or availability.

### 4. HITL

Used when source truth is ambiguous or confidence is low.

HITL responsibilities:

```text
select correct model URL
select assembly diagram sections
reject hallucinated/irrelevant sections
enter expected count when source displays it
approve section extraction
approve/reject low-confidence part rows
approve/reject price rows
resume queued extraction jobs
```

---

## Stage Pipeline

### Stage 1 — Identity Resolution

Input:

```text
manufacturer
appliance_type
model_number
serial_number
```

Output:

```text
MachineIdentity
```

Accepted only if:

```text
normalized_model exists
source evidence exists
serial scope is explicit: serial_specific | model_level_only | unknown
```

### Stage 2 — Diagram Discovery

Tools:

```text
Playwright
BeautifulSoup/Cheerio
provider-specific URL resolvers
```

Output:

```text
DiagramDiscoveryPacket
```

Contains candidate provider URLs and candidate assembly sections.

### Stage 3 — HITL Section Selection

Human sees:

```text
candidate section name
provider/source
section URL
diagram/image URL
expected count if present
confidence
reason flags
```

Human actions:

```text
approve_section
reject_section
edit_section_name
enter_expected_count
enter_provider_model_url
request_playwright_capture
queue_selected_sections
```

Output:

```text
LockedSectionManifest
```

### Stage 4 — Section Extraction

Input:

```text
LockedSection
HTML snapshot
text snapshot
diagram image URL if available
known existing part numbers
```

Extraction order:

```text
1. deterministic parser
2. programmatic regex/table parser
3. AI extractor over section snapshot
4. HITL review for low-confidence rows
```

Output:

```text
SectionExtractionResult
```

### Stage 5 — Pricing

Input:

```text
validated part rows
current service part numbers
supplier priority list
```

Supplier priority:

```text
Encompass
ReliableParts
DLParts / D&L
Sears PartsDirect
PartsDr
PartSelect
AppliancePartsPros
RepairClinic
Fix
eBay
```

Output:

```text
PriceObservation[]
```

Every verified price must be written to:

```text
part_pricing
```

### Stage 6 — Reconciliation

Deduplication key priority:

```text
current_service_part_number
current_oem_part_number
original_part_number
```

Output:

```text
MasterBomLedger
```

---

## Confidence Gates

### Auto-Accept

```text
confidence >= 0.92
schema valid
source evidence present
section locked or deterministic section source
part number valid
no supersession ambiguity
```

### HITL Required

```text
confidence < 0.92
multiple model candidates
serial/revision ambiguity
section source missing
part number appears malformed
price source missing
supersession conflict
expected count mismatch
```

### Reject

```text
no evidence URL
no model match
no section provenance
AI-only section name
price without supplier/source
0.00 placeholder price
```

---

## Retrieval States

```text
identity_resolved
provider_routes_found
diagram_candidates_found
hitl_review_required
sections_locked
selected_sections_queued
section_extracting
section_parts_partial
section_parts_complete
section_pricing_partial
section_complete
model_partial
model_complete
failed_no_source_truth
failed_validation
```

---

## Required DB Behavior

Accepted outputs must write to DB:

```text
provider_model_routes
provider_assembly_sections
provider_part_seed_rows
bom_assemblies
bom_parts
part_pricing
retrieval_jobs
capture_artifacts
model_retrieval_summary
```

Transient response-only data is not source truth.

---

## Human Review Packet

Pydantic model:

```text
HitlReviewPacket
```

Must include:

```text
identity
candidate_sources
candidate_sections
existing_counts
failure_reason
recommended_action
human_decisions
```

The UI should display this packet when automatic confidence is below threshold.

---

## AI Role After HITL

AI extraction prompt is section-scoped:

```text
Extract part rows only from this approved section snapshot.
Do not search the whole model.
Do not invent missing rows.
Return typed JSON only.
```

AI output is accepted only after Pydantic validation.

---

## Acceptance Criteria

The implementation is acceptable when:

```text
1. Every extraction object validates through Pydantic.
2. Every part has section provenance.
3. Every price has supplier provenance or is marked missing.
4. Human can approve/reject diagram sections before AI extraction.
5. Low-confidence rows are not written as final truth.
6. The UI shows expected/found/priced/missing counts per section.
7. The system can resume from locked sections without repeating model-wide search.
```
