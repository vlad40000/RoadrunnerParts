import { describe, it, expect } from "vitest";
import { validate_bom_completion } from "../bom-validator";
import { BomRow } from "../../schemas/bom";

describe("BOM Validator - Structural Pricing Dependency", () => {
  const mockRow: BomRow = {
    section: "Test Section",
    diagramNumber: "1",
    description: "Test Part",
    originalPartNumber: "P123",
    currentServicePartNumber: "P123",
    sourceUrl: "http://test.com",
    sourceType: "distributor",
    confidence: 1,
    retailPrice: {
      status: "verified_price",
      listedPrice: 10.0,
      checkedAt: new Date().toISOString()
    }
  } as any;

  it("should return pricingComplete=false if partsComplete is false, even if prices are present", () => {
    const result = validate_bom_completion({
      rows: [mockRow],
      trustedTotalPartCount: 2, // Parts incomplete (1/2)
      identityResolved: true,
      manifestRowCount: 2,
      requiredManifestRowCount: 2,
      mappedRequiredManifestRowCount: 1,
      unresolvedRequiredManifestRowCount: 1
    });

    expect(result.partsComplete).toBe(false);
    expect(result.pricingComplete).toBe(false);
    expect(result.bomComplete).toBe(false);
    expect(result.reason).toContain("pricing cannot be complete if parts are incomplete");
  });

  it("should return pricingComplete=true only when partsComplete is true and all parts have prices", () => {
    const result = validate_bom_completion({
      rows: [mockRow],
      trustedTotalPartCount: 1, // Parts complete (1/1)
      identityResolved: true,
      manifestRowCount: 1,
      requiredManifestRowCount: 1,
      mappedRequiredManifestRowCount: 1,
      unresolvedRequiredManifestRowCount: 0
    });

    expect(result.partsComplete).toBe(true);
    expect(result.pricingComplete).toBe(true);
    expect(result.bomComplete).toBe(true);
  });

  it("should return pricingComplete=false if partsComplete is true but some parts lack prices", () => {
    const rowNoPrice = { ...mockRow, retailPrice: null };
    const result = validate_bom_completion({
      rows: [rowNoPrice],
      trustedTotalPartCount: 1,
      identityResolved: true,
      manifestRowCount: 1,
      requiredManifestRowCount: 1,
      mappedRequiredManifestRowCount: 1,
      unresolvedRequiredManifestRowCount: 0
    });

    expect(result.partsComplete).toBe(true);
    expect(result.pricingComplete).toBe(false);
    expect(result.bomComplete).toBe(false);
  });

  it("should return retrievalState='no_result' if identityResolved is false", () => {
    const result = validate_bom_completion({
      rows: [mockRow],
      trustedTotalPartCount: 1,
      identityResolved: false,
      manifestRowCount: 1,
      requiredManifestRowCount: 1,
      mappedRequiredManifestRowCount: 1,
      unresolvedRequiredManifestRowCount: 0
    });

    expect(result.retrievalState).toBe("no_result");
    expect(result.bomComplete).toBe(false);
  });
});
