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

  const serialScope = input.serial
    ? `Serial: ${input.serial}`
    : 'Serial: not provided; use model-level data and set serialScopeStatus="model_level_only".';

  const expectedCount = input.expectedPartCount
    ? `Expected total already known: ${input.expectedPartCount}`
    : 'Expected total unknown; infer only from source-backed section/diagram evidence.';

  const context = input.sectionManifestJson?.trim()
    ? input.sectionManifestJson.trim().slice(0, 2500)
    : 'none';

  return `You are a structured appliance BOM extraction worker. Return ONLY minified valid JSON.

MODEL: ${input.model}
${serialScope}
Manufacture date: ${input.manufactureDate || 'unknown'}
Pass: ${input.passNumber || 1}
${expectedCount}
Known part numbers to exclude: ${knownPartNumbers}
Approved suppliers by priority: ${input.approvedSupplierList}
Context: ${context}

Phase rules:
1. Resolve serial/revision when possible.
2. Identify official assembly sections before parts.
3. Extract only real serviceable OEM/source-backed parts.
4. Check supersession/replacement.
5. Price only from approved suppliers.
6. If price is unverified: price=null, priceSource="supplier_price_required".
7. Do not invent sections, counts, parts, prices, availability, or supersessions.
8. Return at most 12 new parts to avoid truncation.
9. No markdown. No explanations. No trailing text.

Required JSON schema:
{"identity":{"manufacturer":null,"applianceType":null,"modelNumber":"${input.model}","serialNumber":${JSON.stringify(input.serial || null)},"normalizedModel":"${input.model}","seriesRevision":null,"serialScopeStatus":"model_level_only","identityConfidence":0,"sourceUrl":null},"summary":{"retrievalState":"parts_partial","sectionCount":0,"expectedTotalPartCount":null,"expectedCountSource":null,"sectionsProcessed":0,"rowsExtracted":0,"uniqueParts":0,"pricedParts":0,"missingPrices":0,"supersededParts":0,"obsoleteParts":0},"sections":[],"parts":[],"missingPrices":[],"incompleteSections":[],"modelMSRP":null}

Each part object must use this compact shape:
{"id":1,"partNumber":"","description":"","section":"","compatibleModels":["${input.model}"],"avgRating":0,"reviewCount":0,"price":null,"priceSource":"supplier_price_required","priceVerified":false,"pricingRequired":true,"referenceNumbers":[],"originalPartNumber":null,"currentOemPartNumber":null,"partTitle":null,"quantity":null,"status":null,"supersededBy":null,"availability":null,"priceUrl":null,"sourceUrls":[],"evidenceNotes":null}

If no source-backed parts are found, return parts:[] and summary.retrievalState="failed_no_source_truth".`;
}
