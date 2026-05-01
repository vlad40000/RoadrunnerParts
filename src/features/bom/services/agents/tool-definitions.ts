import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

function enumString(values: string[]) {
  return {
    type: SchemaType.STRING,
    format: "enum",
    enum: values,
  } as any;
}

const openObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {},
} as any;

/**
 * 1. OCR / Identity Functions
 */

export const ocr_extract_nameplate: FunctionDeclaration = {
  name: "ocr_extract_nameplate",
  description: "Extract appliance identity clues from one or more uploaded nameplate images. Return raw text, brand, model, serial, product code, voltage/type, and confidence. Do not infer missing model digits.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      imageAssetIds: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Uploaded image asset IDs.",
      },
      expectedApplianceType: {
        ...enumString(["washer", "dryer", "refrigerator", "dishwasher", "range", "microwave", "unknown"]),
      },
    },
    required: ["imageAssetIds"],
  },
};

export const normalize_appliance_identity: FunctionDeclaration = {
  name: "normalize_appliance_identity",
  description: "Normalize OCR output into canonical brand, brand family, model, base model, variant, appliance type, and manufacturer routing code.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      brand: { type: SchemaType.STRING },
      model: { type: SchemaType.STRING },
      serial: { type: SchemaType.STRING },
      productCode: { type: SchemaType.STRING },
      rawText: { type: SchemaType.STRING },
    },
    required: ["model"],
  },
};

export const decode_machine_serial_date: FunctionDeclaration = {
  name: "decode_machine_serial_date",
  description: "Decode manufacture date from serial number using deterministic brand-family rules. Return candidates, selected year, month/week, confidence, and rules applied.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      brandFamily: { type: SchemaType.STRING },
      serial: { type: SchemaType.STRING },
    },
    required: ["brandFamily", "serial"],
  },
};

/**
 * 2. DB / Cache Functions
 */

export const db_get_model_record: FunctionDeclaration = {
  name: "db_get_model_record",
  description: "Check whether normalized appliance model already exists in the database.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["normalizedModel"],
  },
};

export const db_get_model_part_count: FunctionDeclaration = {
  name: "db_get_model_part_count",
  description: "Return expected part count, actual part count, diagram count, section count, and source confidence for a model.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["normalizedModel"],
  },
};

export const db_get_parts_for_model: FunctionDeclaration = {
  name: "db_get_parts_for_model",
  description: "Return stored part rows for a model.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["normalizedModel"],
  },
};

export const db_get_price_coverage_for_model: FunctionDeclaration = {
  name: "db_get_price_coverage_for_model",
  description: "Return required price count, verified price count, unpriced part numbers, and price confidence summary for a model.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["normalizedModel"],
  },
};

export const validate_cached_parts_completeness: FunctionDeclaration = {
  name: "validate_cached_parts_completeness",
  description: "Compare stored BOM rows against expected diagram/source count and return whether the part list is complete.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      expectedPartCount: { type: SchemaType.INTEGER },
      actualPartCount: { type: SchemaType.INTEGER },
    },
    required: ["normalizedModel", "actualPartCount"],
  },
};

export const validate_cached_price_completeness: FunctionDeclaration = {
  name: "validate_cached_price_completeness",
  description: "Compare verified pricing coverage against required part list and return whether the price list is complete.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      requiredPriceCount: { type: SchemaType.INTEGER },
      verifiedPriceCount: { type: SchemaType.INTEGER },
    },
    required: ["normalizedModel", "verifiedPriceCount"],
  },
};

export const validate_bom_completion: FunctionDeclaration = {
  name: "validate_bom_completion",
  description: "Validate whether a model has a complete BOM. BOM completion requires all expected parts plus verified listed retail pricing for every required part.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      expectedPartCount: { type: SchemaType.INTEGER },
      actualPartCount: { type: SchemaType.INTEGER },
      requiredPriceCount: { type: SchemaType.INTEGER },
      verifiedPriceCount: { type: SchemaType.INTEGER },
    },
    required: [
      "normalizedModel",
      "expectedPartCount",
      "actualPartCount",
      "requiredPriceCount",
      "verifiedPriceCount"
    ],
  },
};

/**
 * 3. Source Resolver Functions
 */

export const resolve_oem_model_sources: FunctionDeclaration = {
  name: "resolve_oem_model_sources",
  description: "Resolve official/OEM source URLs for GE, Bosch, Frigidaire, LG, Samsung, and Whirlpool-family models.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      brandFamily: {
        ...enumString(["ge-official", "bosch-family", "frigidaire-family", "lg-family", "samsung-family", "whirlpool-family", "unknown"]),
      },
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["brandFamily", "normalizedModel"],
  },
};

export const resolve_distributor_sources: FunctionDeclaration = {
  name: "resolve_distributor_sources",
  description: "Resolve Tier 1, Tier 2, and Tier 3 distributor model/diagram URLs. Use grounding search only when generated URL IDs are required.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      brandFamily: { type: SchemaType.STRING },
    },
    required: ["normalizedModel", "brandFamily"],
  },
};

export const fetch_source_page: FunctionDeclaration = {
  name: "fetch_source_page",
  description: "Fetch a source URL and return normalized page text, links, metadata, and extraction hints. Do not parse parts here.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      url: { type: SchemaType.STRING },
      source: { type: SchemaType.STRING },
      purpose: {
        ...enumString(["model_validation", "diagram_discovery", "parts_extraction", "price_validation"]),
      },
    },
    required: ["url", "source", "purpose"],
  },
};

export const extract_diagram_sections: FunctionDeclaration = {
  name: "extract_diagram_sections",
  description: "Extract diagram/assembly sections, section names, section URLs, section IDs, and expected section count.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      source: { type: SchemaType.STRING },
      sourceUrl: { type: SchemaType.STRING },
      normalizedModel: { type: SchemaType.STRING },
    },
    required: ["source", "sourceUrl", "normalizedModel"],
  },
};

export const extract_full_diagram_manifest: FunctionDeclaration = {
  name: "extract_full_diagram_manifest",
  description: "Extract a complete diagram-indexed manifest for an exact appliance model. Return trusted source count, sections, manifest rows, and non-orderable/diagram-only row flags.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      source: { type: SchemaType.STRING },
      sourceUrl: { type: SchemaType.STRING },
      normalizedModel: { type: SchemaType.STRING },
      trustedTotalPartCount: { type: SchemaType.INTEGER },
    },
    required: ["source", "sourceUrl", "normalizedModel"],
  },
};

export const extract_diagram_section_rows: FunctionDeclaration = {
  name: "extract_diagram_section_rows",
  description: "Extract manifest rows for one diagram section. Return diagram key, callout, expected part number/name, quantity, row type, and source evidence.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      manifestId: { type: SchemaType.STRING },
      normalizedModel: { type: SchemaType.STRING },
      sectionName: { type: SchemaType.STRING },
      sectionUrl: { type: SchemaType.STRING },
      source: { type: SchemaType.STRING },
    },
    required: ["normalizedModel", "sectionName", "source"],
  },
};

export const accept_trusted_total_part_count: FunctionDeclaration = {
  name: "accept_trusted_total_part_count",
  description: "Accept or reject a trusted exact-model total part count. The source model must exactly match the normalized model and the stated count must be positive.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      source: {
        ...enumString(["encompass", "sears-partsdirect", "partsdr", "appliancepartspros", "partselect.com", "fix.com"]),
      },
      normalizedModel: { type: SchemaType.STRING },
      sourceModel: { type: SchemaType.STRING },
      statedPartCount: { type: SchemaType.INTEGER },
      sourceUrl: { type: SchemaType.STRING },
    },
    required: ["source", "normalizedModel", "sourceModel", "statedPartCount", "sourceUrl"],
  },
};

export const db_upsert_model_sources: FunctionDeclaration = {
  name: "db_upsert_model_sources",
  description: "Persist resolved model sources and diagram section URLs for a model.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      sources: {
        type: SchemaType.ARRAY,
        items: openObjectSchema,
      },
    },
    required: ["normalizedModel", "sources"],
  },
};

/**
 * 4. Parts Extraction Functions
 */

export const extract_parts_from_section: FunctionDeclaration = {
  name: "extract_parts_from_section",
  description: "Extract part rows from one diagram/assembly section. Return callout number, part number, name, quantity, substitution, source URL, and confidence.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      source: { type: SchemaType.STRING },
      normalizedModel: { type: SchemaType.STRING },
      sectionName: { type: SchemaType.STRING },
      sectionUrl: { type: SchemaType.STRING },
    },
    required: ["source", "normalizedModel", "sectionName"],
  },
};

export const synthesize_bom: FunctionDeclaration = {
  name: "synthesize_bom",
  description: "Merge extracted part rows into canonical BOM rows. Deduplicate by OEM part number, preserve source evidence, and flag conflicts.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      sourcePartBatchIds: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
    },
    required: ["normalizedModel", "sourcePartBatchIds"],
  },
};

export const db_upsert_bom_parts: FunctionDeclaration = {
  name: "db_upsert_bom_parts",
  description: "Persist canonical BOM rows. Never write zero-row or failed retrievals as complete.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      retrievalState: {
        ...enumString(["no_result", "identity_only", "sources_resolved", "parts_partial", "parts_complete_pricing_missing", "parts_complete_pricing_partial", "bom_complete", "failed"]),
      },
      actualPartCount: { type: SchemaType.INTEGER },
      bomRowsAssetId: { type: SchemaType.STRING },
    },
    required: ["normalizedModel", "retrievalState", "actualPartCount"],
  },
};

export const map_found_parts_to_diagram_manifest: FunctionDeclaration = {
  name: "map_found_parts_to_diagram_manifest",
  description: "Map canonical found BOM rows to required diagram manifest rows. Return exact, substitute, cross-reference, missing, duplicate, ambiguous, not-orderable, and diagram-only mapping statuses.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      manifestId: { type: SchemaType.STRING },
      bomRowsAssetId: { type: SchemaType.STRING },
      mappingPolicy: {
        ...enumString(["exact_first", "allow_substitutes", "manual_review"]),
      },
    },
    required: ["normalizedModel", "manifestId", "bomRowsAssetId"],
  },
};

export const validate_manifest_coverage: FunctionDeclaration = {
  name: "validate_manifest_coverage",
  description: "Validate that the full diagram manifest meets or exceeds the trusted total part count and reports required/non-required row coverage.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      trustedTotalPartCount: { type: SchemaType.INTEGER },
      manifestRowCount: { type: SchemaType.INTEGER },
      requiredManifestRowCount: { type: SchemaType.INTEGER },
      notOrderableRowCount: { type: SchemaType.INTEGER },
      diagramOnlyRowCount: { type: SchemaType.INTEGER },
    },
    required: ["normalizedModel", "trustedTotalPartCount", "manifestRowCount", "requiredManifestRowCount"],
  },
};

export const validate_parts_completeness_against_manifest: FunctionDeclaration = {
  name: "validate_parts_completeness_against_manifest",
  description: "Validate parts completeness by ensuring every required manifest row maps to a canonical BOM part and actual canonical parts meet the trusted total count.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      trustedTotalPartCount: { type: SchemaType.INTEGER },
      actualCanonicalPartCount: { type: SchemaType.INTEGER },
      requiredManifestRowCount: { type: SchemaType.INTEGER },
      mappedRequiredManifestRowCount: { type: SchemaType.INTEGER },
      unresolvedRequiredManifestRowCount: { type: SchemaType.INTEGER },
    },
    required: [
      "normalizedModel",
      "trustedTotalPartCount",
      "actualCanonicalPartCount",
      "requiredManifestRowCount",
      "mappedRequiredManifestRowCount",
      "unresolvedRequiredManifestRowCount",
    ],
  },
};

/**
 * 5. Verified Retail Pricing Functions
 */

export const resolve_part_pricing_sources: FunctionDeclaration = {
  name: "resolve_part_pricing_sources",
  description: "Given a canonical OEM part number, return prioritized retail pricing sources. Encompass must be first unless blocked or unavailable.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
    },
    required: ["partNumber"],
  },
};

export const fetch_encompass_listed_price: FunctionDeclaration = {
  name: "fetch_encompass_listed_price",
  description: "Fetch the currently listed public Encompass price for an exact OEM part number. Do not estimate. If no exact visible price exists, return no_price.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
    },
    required: ["partNumber"],
  },
};

export const fetch_fallback_listed_price: FunctionDeclaration = {
  name: "fetch_fallback_listed_price",
  description: "Fetch a currently listed retail price from fallback source for an exact OEM part number. Do not estimate. Do not use compatible-only matches unless marked as substitute.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      source: { type: SchemaType.STRING },
    },
    required: ["partNumber", "source"],
  },
};

export const validate_exact_price_evidence: FunctionDeclaration = {
  name: "validate_exact_price_evidence",
  description: "Validate that fetched price is exact source-listed price for requested OEM part number. Reject estimates, inferred prices, unrelated listings, compatible-only matches, and stale data.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      requestedPartNumber: { type: SchemaType.STRING },
      priceEvidence: openObjectSchema,
    },
    required: ["requestedPartNumber", "priceEvidence"],
  },
};

export const select_primary_verified_price: FunctionDeclaration = {
  name: "select_primary_verified_price",
  description: "Select the primary verified listed retail price from validated evidence. Encompass wins when valid. Do not average or estimate.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      validatedPriceEvidence: {
        type: SchemaType.ARRAY,
        items: openObjectSchema,
      },
    },
    required: ["partNumber", "validatedPriceEvidence"],
  },
};

export const db_upsert_verified_price_snapshot: FunctionDeclaration = {
  name: "db_upsert_verified_price_snapshot",
  description: "Persist verified price snapshot for a part. Rule: Only verified listed retail prices are stored.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      partNumber: { type: SchemaType.STRING },
      priceSnapshot: openObjectSchema,
    },
    required: ["partNumber", "priceSnapshot"],
  },
};

export const calculate_machine_priority: FunctionDeclaration = {
  name: "calculate_machine_priority",
  description: "Calculate a priority score (0-1000) for the machine based on total BOM MSRP, high-value components, and brand desirability.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      normalizedModel: { type: SchemaType.STRING },
      totalMsrp: { type: SchemaType.NUMBER },
      brand: { type: SchemaType.STRING },
    },
    required: ["normalizedModel", "totalMsrp", "brand"],
  },
};

export const CORE_BOM_TOOLS = [
  ocr_extract_nameplate,
  normalize_appliance_identity,
  decode_machine_serial_date,
  db_get_model_record,
  db_get_model_part_count,
  db_get_parts_for_model,
  db_get_price_coverage_for_model,
  validate_cached_parts_completeness,
  validate_cached_price_completeness,
  validate_bom_completion,
  resolve_oem_model_sources,
  resolve_distributor_sources,
  fetch_source_page,
  extract_diagram_sections,
  extract_full_diagram_manifest,
  extract_diagram_section_rows,
  accept_trusted_total_part_count,
  db_upsert_model_sources,
  extract_parts_from_section,
  synthesize_bom,
  db_upsert_bom_parts,
  map_found_parts_to_diagram_manifest,
  validate_manifest_coverage,
  validate_parts_completeness_against_manifest,
  resolve_part_pricing_sources,
  fetch_encompass_listed_price,
  fetch_fallback_listed_price,
  validate_exact_price_evidence,
  select_primary_verified_price,
  db_upsert_verified_price_snapshot,
  calculate_machine_priority,
];
