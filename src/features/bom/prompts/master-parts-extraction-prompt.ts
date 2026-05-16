type MasterPartsExtractionPromptInput = {
  model: string;
  serial?: string | null;
  manufactureDate?: string | null;
  passNumber?: number | null;
  passInstruction?: string | null;
  knownPartNumbers?: string[];
  expectedPartCount?: number | null;
  approvedSupplierList: string;
  sectionManifestJson?: string | null;
};

export function buildMasterPartsExtractionPrompt(input: MasterPartsExtractionPromptInput) {
  const knownPartNumbers = input.knownPartNumbers?.length
    ? input.knownPartNumbers.join(', ')
    : 'NONE';

  const expectedCountLine = input.expectedPartCount
    ? `Expected total part count already known: ${input.expectedPartCount}`
    : 'Expected total part count is not yet trusted. Resolve it from source-backed diagram/section evidence before claiming completeness.';

  const serialLine = input.serial
    ? `Serial Number: ${input.serial}`
    : 'Serial Number: not provided. If serial-specific filtering is unavailable, mark serialScopeStatus as model_level_only.';

  const manufactureDateLine = input.manufactureDate
    ? `Approximate Manufacture Date: ${input.manufactureDate}`
    : 'Approximate Manufacture Date: unknown.';

  const sectionManifestLine = input.sectionManifestJson?.trim()
    ? `Known section manifest / DB context:\n${input.sectionManifestJson}`
    : 'Known section manifest / DB context: none supplied in this call. Use search/provider evidence to identify the official section index first.';

  return `Role:
Act as a Senior Appliance Parts Researcher and structured BOM extraction agent.

Your objective is to build or extend a complete Bill of Materials for one appliance using a hierarchical extraction workflow.

Machine Identity:
Manufacturer: Unknown unless source evidence resolves it
Appliance Type: Unknown unless source evidence resolves it
Model Number: ${input.model}
${serialLine}
${manufactureDateLine}

Current pass number: ${input.passNumber || 1}
${input.passInstruction || ''}

${expectedCountLine}

Known part numbers already found — do not repeat these:
${knownPartNumbers}

${sectionManifestLine}

Core operating model:
Machine
→ Serial / Revision / Series
→ Assembly Diagram Sections
→ Diagram Callout Rows
→ Part Numbers
→ Supersession / Availability / Pricing

Hard rules:
- Do not treat this as a flat generic web search.
- Do not search for random individual parts before identifying the assembly diagram section index.
- Do not invent part numbers, titles, sections, prices, stock status, supersessions, or expected counts.
- Do not use $0.00 placeholder prices.
- Do not claim completion unless all known sections are processed and pricing status is known.
- If serial-specific filtering is unavailable, mark serialScopeStatus as model_level_only and proceed with model-level source truth.
- If pricing cannot be verified, set price to null and priceSource to supplier_price_required.

Task 1 — Version / Serial Identification:
First determine the correct series, engineering revision, production run, or serial-specific model variation for this unit.
Return the source evidence if available.

Task 2 — Assembly Section Inventory:
Before extracting parts, identify the official exploded-view assembly diagram sections for this model/revision.
Do not omit internal, small-parts, hardware, wiring, optional installation, documentation, or structural sections unless the source explicitly marks them non-serviceable.

Task 3 — Expected Count:
Determine expected total count as early as possible using this priority:
1. trusted manufacturer/provider total count
2. sum of expected section counts
3. unique source-backed part number count from diagram rows
4. unknown only if diagram/source truth is missing

Task 4 — Section-by-Section Extraction:
Process assembly sections one at a time. For every diagram row, capture:
- assembly section name
- reference/callout number
- original part number
- current OEM/service part number
- part title/description
- quantity if listed
- status / availability
- source URL

Do not skip screws, clips, retainers, brackets, seals, gaskets, harnesses, labels, panels, wiring, internal hardware, or optional installation parts unless the source explicitly excludes them.

Task 5 — Supersession / Substitution:
For every part, check whether it is active, superseded, substituted, replaced, discontinued, obsolete, or NLA.
If superseded, use the current authorized service part number as the final part number while preserving the original number.

Task 6 — Pricing:
For every current service part number, find current pricing and availability.
Supplier priority:
${input.approvedSupplierList}

Pricing rules:
- Use current authorized distributor/list pricing when available.
- If multiple prices exist, select display price by supplier priority.
- If price cannot be verified, set price to null and priceSource to supplier_price_required.
- Do not fabricate prices.

Task 7 — Deduplication:
Create one master ledger row per current service/OEM part number.
If the same part appears in multiple sections, list it once but preserve all section/callout/source evidence.
Do not include any known part number already listed above.

Return only valid JSON. No markdown. No commentary.

Required JSON shape:
{
  "identity": {
    "manufacturer": null,
    "applianceType": null,
    "modelNumber": "${input.model}",
    "serialNumber": ${JSON.stringify(input.serial || null)},
    "normalizedModel": "${input.model}",
    "seriesRevision": null,
    "serialScopeStatus": "serial_specific | model_level_only | unknown",
    "identityConfidence": 0,
    "sourceUrl": null
  },
  "summary": {
    "retrievalState": "identity_resolved | section_manifest_found | section_manifest_missing | parts_partial | parts_complete_pricing_missing | pricing_partial | complete | failed_no_source_truth",
    "sectionCount": 0,
    "expectedTotalPartCount": null,
    "expectedCountSource": null,
    "sectionsProcessed": 0,
    "rowsExtracted": 0,
    "uniqueParts": 0,
    "pricedParts": 0,
    "missingPrices": 0,
    "supersededParts": 0,
    "obsoleteParts": 0
  },
  "sections": [
    {
      "sectionId": "",
      "sectionName": "",
      "sectionSequence": null,
      "source": "",
      "sectionUrl": "",
      "diagramUrl": "",
      "expectedPartCount": null,
      "foundPartCount": 0,
      "pricedPartCount": 0,
      "state": ""
    }
  ],
  "parts": [
    {
      "id": 1,
      "partNumber": "",
      "description": "",
      "section": "",
      "compatibleModels": ["${input.model}"],
      "avgRating": 0,
      "reviewCount": 0,
      "price": null,
      "priceSource": "supplier_price_required",
      "priceVerified": false,
      "pricingRequired": true,
      "referenceNumbers": [],
      "originalPartNumber": null,
      "currentOemPartNumber": null,
      "partTitle": null,
      "quantity": null,
      "status": null,
      "supersededBy": null,
      "availability": null,
      "priceUrl": null,
      "sourceUrls": [],
      "evidenceNotes": null
    }
  ],
  "missingPrices": [],
  "incompleteSections": [],
  "modelMSRP": null
}

Target approximately 40 new valid OEM/serviceable parts for this pass unless the real remaining count is lower. If the source-backed model has fewer remaining parts, return only the real remaining parts. Never pad the result.`;
}
