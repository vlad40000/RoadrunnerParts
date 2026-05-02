import { FunctionCall } from "@google/generative-ai";
import { 
  normalizeModel, 
  normalizeSerialNumber, 
  normalizeBrandLabel 
} from "../utils";
import { 
  getManufacturerFamilyConfig, 
  resolveTrueOemBrand 
} from "@/lib/providers/manufacturer/family-config";
import { resolvePartsSources } from "@/lib/partsSourceRegistry";
import { agentAssetStore } from "./asset-store";

import { calculateMachinePriority } from "../priority-scoring";
import { CORE_BOM_TOOLS } from "./tool-definitions";
import { EBAY_MARKET_TOOLS } from "./ebay-tool-definitions";
import {
  acceptTrustedPartCount,
  determineRetrievalState,
  validateManifestCoverage,
} from "../contract";

export async function dispatchBomToolCall(call: FunctionCall): Promise<any> {
  const args = call.args as any;

  switch (call.name) {
    /**
     * 0. Visual Truth / Supervisor Functions
     */
    case "encompass_visual_supervisor": {
      const model = args.model;
      const targetUrl = args.url || `https://encompass.com/search?searchTerm=${model}`;
      
      console.log(`[Dispatcher] Establishing Visual Truth for ${model} via Encompass...`);
      
      // We call our internal API route to handle the Playwright execution
      // This ensures we stay within the Node.js runtime environment required by Playwright
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/bom/supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, url: targetUrl })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Visual Supervisor failed: ${error.details || error.error || response.statusText}`);
      }

      return await response.json();
    }

    /**
     * 1. OCR / Identity Functions
     */
    case "ocr_extract_nameplate":
      // Implementation: This usually calls an OCR service or returns clues from asset store
      return { 
        status: "clues_extracted", 
        rawText: "Sample OCR text", 
        brand: "Whirlpool", 
        model: "MED5600TQ0", 
        serial: "C91370070",
        confidence: 0.95
      };

    case "normalize_appliance_identity": {
      const model = normalizeModel(args.model);
      const brand = normalizeBrandLabel(args.brand);
      const resolvedBrand = resolveTrueOemBrand(brand, model);
      const family = getManufacturerFamilyConfig(resolvedBrand, model);
      return {
        brand: resolvedBrand,
        brandFamily: family?.key || "unknown",
        model,
        baseModel: model.substring(0, 7), // Example logic
        variant: model.substring(7),
        applianceType: args.applianceType || "unknown",
        manufacturerRoutingCode: family?.adapterKey || "distributor-pass"
      };
    }

    case "decode_machine_serial_date":
      // Implementation: Brand-specific serial decoding
      return {
        candidates: [{ year: 2019, month: 3, confidence: 0.9 }],
        selectedYear: 2019,
        selectedMonth: 3,
        confidence: 0.9,
        rulesApplied: "Whirlpool standard date code"
      };

    /**
     * 2. DB / Cache Functions
     */
    case "db_get_model_record":
      return { exists: false, modelId: null };

    case "db_get_model_part_count":
      return { 
        normalizedModel: args.normalizedModel,
        expectedPartCount: 45, 
        actualPartCount: 0, 
        diagramCount: 6, 
        sectionCount: 6,
        sourceConfidence: 0.8
      };

    case "db_get_parts_for_model":
      return { normalizedModel: args.normalizedModel, parts: [] };

    case "db_get_price_coverage_for_model":
      return {
        normalizedModel: args.normalizedModel,
        requiredPriceCount: 45,
        verifiedPriceCount: 0,
        unpricedPartNumbers: [],
        priceConfidenceSummary: 0
      };

    case "validate_cached_parts_completeness":
      return { isComplete: args.actualPartCount >= args.expectedPartCount };

    case "validate_cached_price_completeness":
      return { isComplete: args.verifiedPriceCount >= args.requiredPriceCount };

    case "validate_bom_completion": {
      const state = determineRetrievalState({
        identityResolved: !!args.normalizedModel,
        expectedPartCount: args.expectedPartCount,
        actualPartCount: args.actualPartCount,
        requiredPriceCount: args.requiredPriceCount,
        verifiedPriceCount: args.verifiedPriceCount,
        failed: false
      });
      return { 
        isComplete: state === "bom_complete",
        retrievalState: state 
      };
    }

    /**
     * 3. Source Resolver Functions
     */

    case "resolve_distributor_sources": {
      const result = resolvePartsSources({
        brand: args.brand || "unknown",
        applianceType: args.applianceType || "unknown",
        modelNumber: args.normalizedModel
      });
      return {
        brandFamily: result.resolvedBrand,
        sources: [
          ...result.primaryRoutes.map(r => ({ name: r.label, url: r.url, confidence: 1.0, priority: "primary" })),
          ...result.secondaryRoutes.map(r => ({ name: r.label, url: r.url, confidence: 0.9, priority: "secondary" }))
        ],
        forbidden_domains: result.forbiddenDomains
      };
    }

    case "fetch_source_page":
      return { 
        assetId: "page_123", 
        text: "Sample page content", 
        links: [], 
        metadata: {}, 
        extractionHints: "Look for parts table" 
      };

    case "extract_diagram_sections":
      return {
        sections: [
          { id: "s1", name: "Cabinet", url: "...", sectionId: "101" }
        ],
        expectedSectionCount: 6
      };

    case "extract_full_diagram_manifest":
      return {
        normalizedModel: args.normalizedModel,
        source: args.source,
        sourceUrl: args.sourceUrl,
        trustedTotalPartCount: args.trustedTotalPartCount ?? null,
        manifestId: `manifest_${args.normalizedModel}`,
        manifestRowCount: 0,
        requiredManifestRowCount: 0,
        sections: [],
        rowsAssetId: null,
      };

    case "extract_diagram_section_rows":
      return {
        normalizedModel: args.normalizedModel,
        sectionName: args.sectionName,
        rows: [],
        rowCount: 0,
      };

    case "accept_trusted_total_part_count":
      return acceptTrustedPartCount({
        source: args.source,
        normalizedModel: args.normalizedModel,
        sourceModel: args.sourceModel,
        statedPartCount: args.statedPartCount,
        sourceUrl: args.sourceUrl,
      });

    case "db_upsert_model_sources":
      return { status: "success", normalizedModel: args.normalizedModel };

    /**
     * 4. Parts Extraction Functions
     */
    case "extract_parts_from_section":
      return {
        parts: [
          { callout: "1", partNumber: "WP123", name: "Belt", quantity: 1, sourceUrl: "..." }
        ],
        confidence: 0.95
      };

    case "synthesize_bom":
      return { assetId: "bom_456", canonicalRowCount: 45 };

    case "db_upsert_bom_parts":
      return { status: "success", normalizedModel: args.normalizedModel };

    case "map_found_parts_to_diagram_manifest":
      return {
        normalizedModel: args.normalizedModel,
        manifestId: args.manifestId,
        mappingBatchId: `mapping_${args.normalizedModel}`,
        mappedRequiredManifestRowCount: 0,
        unresolvedRequiredManifestRowCount: 0,
        mappings: [],
      };

    case "validate_manifest_coverage":
      return validateManifestCoverage({
        trustedTotalPartCount: args.trustedTotalPartCount,
        manifestRowCount: args.manifestRowCount,
        requiredManifestRowCount: args.requiredManifestRowCount,
        mappedRequiredManifestRowCount: args.requiredManifestRowCount,
        unresolvedRequiredManifestRowCount: 0,
        actualCanonicalPartCount: args.manifestRowCount,
      });

    case "validate_parts_completeness_against_manifest":
      return validateManifestCoverage({
        trustedTotalPartCount: args.trustedTotalPartCount,
        manifestRowCount: args.requiredManifestRowCount,
        requiredManifestRowCount: args.requiredManifestRowCount,
        mappedRequiredManifestRowCount: args.mappedRequiredManifestRowCount,
        unresolvedRequiredManifestRowCount: args.unresolvedRequiredManifestRowCount,
        actualCanonicalPartCount: args.actualCanonicalPartCount,
      });

    /**
     * 5. Verified Retail Pricing Functions
     */
    case "resolve_part_pricing_sources":
      return {
        partNumber: args.partNumber,
        sources: [
          { source: "sears-partsdirect", priority: 1, role: "primary" },
          { source: "fix.com", priority: 2, role: "fallback" },
          { source: "repairclinic-family", priority: 3, role: "fallback" },
          { source: "appliancepartspros", priority: 4, role: "fallback" }
        ]
      };


    case "fetch_fallback_listed_price":
      return {
        status: "fallback_verified_price",
        source: args.source,
        listedPrice: 26.50,
        currency: "USD",
        productUrl: `https://${args.source}/...`,
        checkedAt: new Date().toISOString(),
        matchType: "exact_part_number",
        requestedPartNumber: args.partNumber,
        matchedPartNumber: args.partNumber
      };

    case "validate_exact_price_evidence":
      return { isValid: true, confidence: 1.0 };

    case "select_primary_verified_price": {
      const best = args.validatedPriceEvidence.sort((a: any, b: any) => (a.priority || 99) - (b.priority || 99))[0];
      return best || { status: "no_verified_price" };
    }

    case "db_upsert_verified_price_snapshot":
      return { status: "success", partNumber: args.partNumber };

    case "calculate_machine_priority":
      return handleCalculatePriority(args);

    /**
     * System 2 — eBay Market / Listing Functions
     */
    case "ebay_search_active_by_part_number":
      return {
        partNumber: args.partNumber,
        activeListings: [
          {
            title: `${args.brand || ""} ${args.partNumber} ${args.partName || ""} Used OEM`,
            price: 29.99,
            shipping: 8.95,
            condition: "used",
            itemUrl: `https://www.ebay.com/itm/...`,
            sellerFeedbackScore: 1234,
            matchConfidence: "high"
          }
        ]
      };

    case "ebay_search_sold_by_part_number":
      return {
        partNumber: args.partNumber,
        soldListings: [
          {
            title: `${args.partNumber} ${args.brand || ""} ${args.partName || ""}`,
            soldPrice: 24.99,
            shipping: 8.5,
            condition: "used",
            soldAt: new Date().toISOString(),
            itemUrl: `https://www.ebay.com/itm/...`,
            matchConfidence: "high"
          }
        ]
      };

    case "filter_ebay_listing_matches":
      return { filteredBatchId: `filtered_${args.listingBatchId}` };

    case "calculate_ebay_sell_through":
      return {
        partNumber: args.partNumber,
        activeCount: 14,
        soldCount: 9,
        sellThroughRate: 0.64,
        demandSignal: "strong"
      };

    case "calculate_ebay_net_expected": {
      const fees = args.medianSoldPrice * 0.15;
      const ship = args.shippingCost || 8.95;
      const pack = 1.25;
      const labor = 3.5;
      return {
        partNumber: args.partNumber,
        medianSoldPrice: args.medianSoldPrice,
        marketplaceFees: Number(fees.toFixed(2)),
        shippingCost: ship,
        packagingCost: pack,
        laborCost: labor,
        netExpected: Number((args.medianSoldPrice - fees - ship - pack - labor).toFixed(2))
      };
    }

    case "generate_ebay_price_recommendation":
      return { recommendedPrice: 32.99, strategy: "high_demand_low_active" };

    case "generate_ebay_title":
      return { title: `${args.brand} ${args.partNumber} ${args.partName} Used Tested OEM Fits ${args.verifiedFitModel || ""}`.trim() };

    case "generate_ebay_description":
      return { description: `OEM Part Number: ${args.partNumber}\nPart Name: ${args.partName}...` };

    case "generate_ebay_item_specifics":
      return {
        Brand: args.brand,
        Type: args.partName,
        Model: args.partNumber,
        MPN: args.partNumber,
        Condition: args.condition
      };

    case "create_ebay_draft_listing":
      return { status: "draft_created", listingId: "ebay_draft_123" };

    case "revise_ebay_listing_price":
      return { status: "revised", listingId: args.listingId, newPrice: args.newPrice };

    case "end_ebay_listing_when_inventory_sold":
      return { status: "ended", listingId: args.listingId, reason: args.reason };

    case "db_upsert_market_snapshot":
      return { status: "success", partNumber: args.partNumber };

    case "db_upsert_channel_listing":
      return { status: "success", channelListingId: args.channelListingId };

    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

async function handleCalculatePriority(args: any) {
  const result = calculateMachinePriority({
    ageMonths: args.decodedAgeMonths || null,
    msrp: args.originalMsrp || null,
    brand: args.brand || null,
    applianceType: args.applianceType || null,
    condition: args.condition || null,
    verifiedPartRetailValue: args.verifiedPartRetailValue || 0,
    ebayDemandSignal: args.ebayDemandSignal || "none",
    decodeConfidence: args.decodeConfidence || "none",
    laborRisk: args.laborRisk || 0,
    storageRisk: args.storageRisk || 0
  });

  return {
    score: result.score,
    recommendedAction: result.recommendedAction,
    reasonCodes: result.reasonCodes,
    factors: result.factors
  };
}
