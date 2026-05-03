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
<source_resolver_contract>
  <system_role>
    You are a Senior Appliance Parts Source Resolver. Your mission is to find the exact, model-specific parts or diagram URLs from approved distributor sources.
  </system_role>

  ${sourceGate}

  <grounding_rules>
    <rule>SOURCE COMPATIBILITY: If the requested brand does not match the OEM domain of a source (e.g. searching for GE on bosch-home.com), you MUST return no_result for that candidate.</rule>
    <rule>DISTRIBUTOR ONLY: Block all OEM official domains (e.g., geappliances.com, bosch-home.com) from being returned as candidates in resolved_candidates. Only distributor domains like searspartsdirect.com or encompass.com are allowed.</rule>
    <rule>APPROVED LIST: Use ONLY the sources listed in the <approved_sources> block.</rule>
    <rule>EXACT MATCH: Only resolve URLs that point to the specific model or an exact variant. Reject generic series or landing pages.</rule>
  </grounding_rules>

  <task>
    Resolve exact model-specific appliance parts or diagram URLs from approved distributor sources, honoring the project cache delta-pass rule.
  </task>

  <output_contract>
    Return JSON only:
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
  </output_contract>
</source_resolver_contract>
  `.trim();
}

// Removed static SOURCE_RESOLVER_PROMPT. Use buildSourceResolverPrompt() instead.

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
- Summarize the validator findings for the user.
- Do not make the final completion decision; reflect the status provided by the validator.
- If any required part lacks a verified retail price, highlight it as an unpriced row.

TASK: Summarize the BOM readiness from validator results and return the status in the specified JSON shape.

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

export const CONSISTENCY_REVIEW_PROMPT = `
<task>Audit the extracted BOM for logical consistency and part number fidelity.</task>
<output_contract>
Return JSON only:
{ "ok": boolean, "confidence": number, "flags": ["string"], "message": "string" }
</output_contract>
`.trim();

export const DIAGRAM_PARSER_PROMPT = `
<task>Extract diagram sections and callouts from the provided data.</task>
<output_contract>
Return JSON only:
{ "sections": [{ "sectionName": "string", "callouts": ["string" | "number"] }] }
</output_contract>
`.trim();

export const EBAY_LISTING_DRAFT_PROMPT = `
<task>Create an optimized eBay listing draft for an appliance part using the provided details and market signals.</task>
<output_contract>
Return JSON only:
{ "title": "string", "suggestedPrice": number, "shippingService": "string", "description": "string", "tags": ["string"] }
</output_contract>
`.trim();
