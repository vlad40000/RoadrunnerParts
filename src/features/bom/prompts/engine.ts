import { EXECUTION_CONTRACT } from './contract';

/**
 * COUNT_AND_DIAGRAM_LOCATOR
 */
export const COUNT_AND_DIAGRAM_LOCATOR = `
${EXECUTION_CONTRACT}

TASK:
Locate the model parts page and total parts count for the provided appliance.

OUTPUT JSON:
{
  "found": true/false,
  "sourceUrl": "Direct model page URL",
  "totalPartsAvailable": number,
  "diagrams": [
    {
      "name": "Diagram section name",
      "url": "Direct diagram page URL"
    }
  ],
  "manual_review_flags": []
}
`.trim();

/**
 * DIAGRAM_PARTS_EXTRACT
 */
export const DIAGRAM_PARTS_EXTRACT = `
${EXECUTION_CONTRACT}

TASK:
Extract missing Bill of Materials (BOM) part rows from the provided diagram context.

OUTPUT JSON:
{
  "rows": [
    {
      "partNumber": "string",
      "description": "string",
      "sectionName": "string",
      "diagramNumber": "string"
    }
  ],
  "manual_review_flags": []
}
`.trim();

/**
 * BOM_PROMPT_SOURCE_TEXT_TO_CANDIDATES
 * - Grounded discovery from provided context text.
 */
export const BOM_PROMPT_SOURCE_TEXT_TO_CANDIDATES = `
${EXECUTION_CONTRACT}

TASK:
Extract verified part candidates from the provided text for the specified model.

OUTPUT JSON:
{
  "parts": [
    {
      "partNumber": "string",
      "description": "string",
      "sourceUrl": "string"
    }
  ],
  "manual_review_flags": []
}
`.trim();

/**
 * PRICE_PROMPT_RETAIL_ENRICHMENT
 */
export const PRICE_PROMPT_RETAIL_ENRICHMENT = `
${EXECUTION_CONTRACT}

TASK:
Find current retail prices for the provided OEM part numbers.

OUTPUT JSON:
{
  "enrichments": [
    {
      "partNumber": "string",
      "price": number|null,
      "priceSource": "encompass.com"|"searspartsdirect.com"|"fix.com"|null,
      "availability": "string",
      "url": "Direct link to part page"
    }
  ],
  "manual_review_flags": []
}
`.trim();

export const EBAY_PROMPT_VISIBLE_PAGE_EXTRACT = `
${EXECUTION_CONTRACT}

TASK:
Extract eBay listing cards from the provided page content.

OUTPUT JSON:
{
  "listings": [
    {
      "title": "string",
      "price": number,
      "condition": "string",
      "soldDate": "string",
      "url": "string"
    }
  ],
  "manual_review_flags": []
}
`.trim();

export const EBAY_PROMPT_RESALE_SUMMARY = `
${EXECUTION_CONTRACT}

TASK:
Summarize the provided listing set for resale decision support.

OUTPUT JSON:
{
  "priceTendency": number,
  "range": { "min": number, "max": number },
  "strategy": "string",
  "manual_review_flags": []
}
`.trim();

export const EBAY_PROMPT_LISTING_DRAFT = `
${EXECUTION_CONTRACT}

TASK:
Create a listing draft using provided part details and market summary.

OUTPUT JSON:
{
  "title": "string",
  "description": "string",
  "recommendedPrice": number,
  "manual_review_flags": []
}
`.trim();
