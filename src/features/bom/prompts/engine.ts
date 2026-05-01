import { formatBrandSourceGateForPrompt } from '../registry/brand-source-gate';

export const ORCHESTRATOR_PROMPT = `
- Choose the next required agent stage based on current appliance model and job state.
- Do not extract parts, price parts, or mark completion in this stage.
- If a validator has not run, prioritize the FINAL_BOM_AUDIT stage.

TASK: Identify the next required agent stage for the current appliance model and job status and return it in the specified JSON shape.

JSON_SHAPE:
{
  "nextStage": "NAMEPLATE_INGEST | IDENTITY_NORMALIZE | DB_CACHE_CHECK | SOURCE_RESOLVE | DIAGRAM_MANIFEST | PARTS_EXTRACTION | MANIFEST_MAPPING | RETAIL_PRICING | FINAL_BOM_AUDIT | FINAL_UI_SUMMARY",
  "reason": "string",
  "requiredInputs": ["string"],
  "blocked": false,
  "blockers": ["string"]
}
`.trim();

export const DB_CACHE_COMPLETENESS_PROMPT = `
- Check if the normalized model exists in the database before starting live retrieval.
- Never mark a BOM as complete from part count alone; require parts and pricing validation.
- Return status bom_complete only when both parts_complete and pricing_complete are true.

TASK: Determine if the cached BOM for the normalized model is complete and can be served from the database and return the status in the specified JSON shape.

JSON_SHAPE:
{
  "status": "bom_complete | parts_complete_pricing_partial | parts_partial | needs_source_resolution",
  "allowedToServeFromCache": "boolean",
  "expectedPartCount": "number | null",
  "actualPartCount": "number | null",
  "verifiedPriceCount": "number | null",
  "nextAction": "string"
}
`.trim();

export function buildSourceResolverPrompt(input: {
  brand?: string | null;
  brandFamily?: string | null;
} = {}) {
  const sourceGate = formatBrandSourceGateForPrompt(input);
  return `
- Use ONLY brand-approved distributor sources listed in the source gate.
- Block all OEM official domains; do not issue site: searches for manufacturer sites.
- Return no_result if the source is incompatible or no exact model/variant match is found.

${sourceGate}

TASK: Resolve exact model-specific appliance parts or diagram URLs from approved distributor sources and return them in the specified JSON shape.

JSON_SHAPE:
{
  "status": "sources_resolved | partial | no_result",
  "source_policy": "distributor_only",
  "resolved_candidates": [
    {
      "source": "string",
      "url": "string",
      "match_type": "exact_model | exact_variant | rejected_nearby_model",
      "confidence": "high | medium | low"
    }
  ],
  "next_tool": "url_context | browser_assist | stop"
}
`.trim();
}

export const SOURCE_RESOLVER_PROMPT = buildSourceResolverPrompt();

export const URL_CONTEXT_GROUNDING_PROMPT = `
- Retrieve source evidence from exact candidate URLs provided in the previous stage.
- Check url_context_metadata to ensure retrieval success before trusting content.
- Avoid bulk URL stuffing; use no more than 1-5 high-confidence URLs per request.

TASK: Retrieve and validate source evidence from exact candidate URLs and return it in the specified JSON shape.

JSON_SHAPE:
{
  "status": "retrieved | retrieval_failed | ambiguous",
  "retrievedUrls": ["string"],
  "failedUrls": ["string"],
  "sourceEvidence": ["string"]
}
`.trim();

export const DIAGRAM_MANIFEST_PROMPT = `
- Extract the trusted total part count and sectioned manifest structure for the exact model.
- Do not infer missing sections or treat source summaries as verified manifest rows.
- Limit: extract up to 40 verified rows per section to satisfy batching requirements.

TASK: Extract the trusted total part count and required diagram manifest rows and return them in the specified JSON shape.

JSON_SHAPE:
{
  "status": "manifest_complete | manifest_partial | failed",
  "trustedTotalPartCount": "number | null",
  "sectionCount": "number | null",
  "manifestRowCount": "number | null",
  "sections": [
    { "name": "string", "url": "string" }
  ]
}
`.trim();

export const FINAL_BOM_AUDIT_PROMPT = `
- Make the final BOM readiness decision using validator outputs only.
- BOM complete requires 100% manifest coverage AND verified listed retail pricing for all parts.
- If any required part lacks a verified retail price, set bomComplete to false.

TASK: Evaluate the final BOM readiness from parts and pricing validator results and return the status in the specified JSON shape.

JSON_SHAPE:
{
  "retrievalState": "bom_complete | parts_complete_pricing_partial | parts_partial | audit_blocked",
  "partsComplete": "boolean",
  "pricingComplete": "boolean",
  "bomComplete": "boolean",
  "expectedPartCount": "number | null",
  "actualPartCount": "number | null",
  "verifiedPriceCount": "number | null"
}
`.trim();

export const FINAL_UI_SUMMARY_PROMPT = `
- Summarize the final BOM retrieval status for the user interface.
- Do not imply completion unless bomComplete is true.
- List any remaining blockers such as missing parts or unverified prices.

TASK: Summarize the current BOM retrieval state for display and return it in the specified JSON shape.

JSON_SHAPE:
{
  "headline": "string",
  "state": "string",
  "partsProgress": "string",
  "pricingProgress": "string",
  "blockers": ["string"]
}
`.trim();

export const EBAY_PROMPT_VISIBLE_PAGE_EXTRACT = `
- Extract eBay listing cards for market resale signal only.
- Never use eBay prices (active or sold) as verified retail pricing.
- eBay data must not affect BOM completion or retail price validation.

TASK: Extract eBay listing data from the provided search results and return them in the specified JSON shape.

JSON_SHAPE:
{
  "listings": [
    {
      "title": "string",
      "price": "number",
      "condition": "string",
      "url": "string"
    }
  ]
}
`.trim();

export const EBAY_PROMPT_RESALE_SUMMARY = `
- Summarize marketplace resale signal without affecting BOM truth or retail pricing.
- Do not produce verified retail pricing from eBay data.
- eBay data is for secondary market analysis only.

TASK: Summarize the marketplace resale signal and return it in the specified JSON shape.

JSON_SHAPE:
{
  "priceTendency": "number",
  "range": { "min": "number", "max": "number" },
  "strategy": "string"
}
`.trim();

/**
 * LEGACY / BATCH PROMPTS
 * Restored to maintain compatibility with batch-orchestrator and specific API routes.
 */

export function buildCountAndDiagramLocatorPrompt(input: { brand?: string | null } = {}) {
  return `
- Locate the exact parts diagram or BOM page for model: {{MODEL}}.
- Brand: {{MAKE}} (Slug: {{FIX_BRAND_SLUG}}).
- Appliance: {{APPLIANCE_TYPE}} (Slug: {{FIX_APPLIANCE_SLUG}}).
- Search URL: {{CANDIDATE_URL}}.
- Serial: {{SERIAL_OR_NULL}} (Confidence: {{SERIAL_CONFIDENCE}}, Year: {{MANUFACTURE_YEAR_OR_NULL}}).

TASK: Resolve the canonical parts page and diagram list and return them in the specified JSON shape.

JSON_SHAPE:
{
  "found": boolean,
  "source": "string",
  "sourceUrl": "string",
  "totalPartsAvailable": number | null,
  "diagrams": [
    { "diagramName": "string", "diagramUrl": "string" }
  ]
}
`.trim();
}

export const DIAGRAM_PARTS_EXTRACT = `
- Extract all part rows from diagram: {{DIAGRAM_NAME}}.
- Model: {{MODEL}}.
- URL: {{DIAGRAM_URL}}.
- Expected total for model: {{TOTAL_PARTS_AVAILABLE}}.
- Known parts already found: {{KNOWN_PART_NUMBERS_JSON}}.

TASK: Extract every part row including diagram position, part number, and description.

JSON_SHAPE:
{
  "parts": [
    {
      "section": "string",
      "diagramNumber": "string",
      "originalPartNumber": "string",
      "description": "string",
      "nlaStatus": boolean
    }
  ]
}
`.trim();

export const PRICE_PROMPT_RETAIL_ENRICHMENT = `
- Find verified RETAIL pricing for the requested appliance parts.
- DO NOT use eBay, Amazon, or marketplace pricing.
- Use only authorized distributor or OEM retail prices.

TASK: Find exact source-listed retail pricing and return them in the specified JSON shape.

JSON_SHAPE:
{
  "enrichments": [
    {
      "partNumber": "string",
      "price": number | null,
      "priceSource": "string",
      "availability": "string",
      "url": "string"
    }
  ]
}
`.trim();

export const EBAY_PROMPT_LISTING_DRAFT = `
- Create an optimized eBay listing draft for an appliance part.
- Use market signals and part details to maximize conversion.
- Condition: Used (unless otherwise specified).

TASK: Generate listing title, price, and description and return them in the specified JSON shape.

JSON_SHAPE:
{
  "title": "string",
  "suggestedPrice": number,
  "shippingService": "string",
  "description": "string",
  "tags": ["string"]
}
`.trim();

export const diagramPrompt = `
- Parse the provided diagram image to identify callouts and section structure.
- Extract section name and all visible reference numbers.

TASK: Extract diagram sections and callouts and return them in the specified JSON shape.

JSON_SHAPE:
{
  "sections": [
    { "sectionName": "string", "callouts": ["string" | "number"] }
  ]
}
`.trim();

export const consistencyPrompt = `
- Audit the extracted BOM for logical consistency and part number fidelity.
- Check for duplicate part numbers with different descriptions.
- Flag any parts that seem incompatible with the product type.

TASK: Audit the BOM for consistency and return the audit result in the specified JSON shape.

JSON_SHAPE:
{
  "ok": boolean,
  "confidence": number,
  "flags": ["string"],
  "message": "string"
}
`.trim();
