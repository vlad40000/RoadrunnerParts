import { describe, it, expect } from "vitest";
import { generateEbayHtmlTemplate } from "../ebay-template-gen";
import { generateEbayDescription } from "../ebay-listing-gen";

describe("eBay Template Generator", () => {
  it("should generate valid HTML containing the RoadrunnerParts namemark", () => {
    const html = generateEbayHtmlTemplate({
      brand: "Whirlpool",
      partNumber: "W10123456",
      partName: "Control Board",
      condition: "used",
    });

    // Check basic HTML structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
    
    // Check namemark
    expect(html).toContain("Roadrunner<span class=\"namemark-accent\">Parts</span>");

    // Check part details
    expect(html).toContain("Whirlpool");
    expect(html).toContain("W10123456");
    expect(html).toContain("Control Board");
    expect(html).toContain("Used - inspected and prepared for resale");

    // Check policies
    expect(html).toContain("return terms shown on this eBay listing");
    expect(html).toContain("1 business day");
  });

  it("should handle missing optional fields gracefully", () => {
    const html = generateEbayHtmlTemplate({
      partNumber: "12345",
    });

    expect(html).toContain("Appliance"); // Default brand
    expect(html).toContain("12345");
    expect(html).toContain("Appliance Component"); // Default name
  });
});

describe("generateEbayDescription", () => {
  it("should call the template generator and return HTML", () => {
    const html = generateEbayDescription({
      brand: "LG",
      partNumber: "EBR12345678",
      partName: "Main PCB",
      condition: "new",
      model: "LMXS28626S"
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("LG");
    expect(html).toContain("EBR12345678");
    expect(html).toContain("New");
    expect(html).toContain("LMXS28626S");
  });
});
