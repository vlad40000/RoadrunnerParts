import { describe, expect, it } from "vitest";
import {
  buildIdentityEvidenceText,
  extractApplianceIdentity,
  normalizeApplianceIdentity,
  normalizeIdentityModel,
} from "../identity-extractor";

describe("identity extractor hardening", () => {
  it("preserves Kenmore model dots", () => {
    expect(normalizeIdentityModel("110.12345678")).toBe("110.12345678");
  });

  it("preserves Samsung and LG suffix punctuation", () => {
    expect(normalizeIdentityModel("wf45t6000aw/a2")).toBe("WF45T6000AW/A2");
    expect(normalizeIdentityModel("LRGL5825F.ABWEEUS")).toBe("LRGL5825F.ABWEEUS");
  });

  it("carries manual review flags through normalization", () => {
    const identity = normalizeApplianceIdentity({
      raw_brand: null,
      raw_model: null,
      raw_serial: null,
      raw_product_type: null,
      confidence: 0.2,
      manual_review_flags: ["ambiguous_model"],
      evidence_summary: "No readable nameplate model.",
    });

    expect(identity.normalized_model).toBe("");
    expect(identity.manual_review_flags).toContain("ambiguous_model");
    expect(identity.manual_review_flags).toContain("missing_model");
    expect(identity.confidence).toBe(0.2);
  });

  it("includes selected manual PDF text as labeled identity evidence", () => {
    const evidence = buildIdentityEvidenceText({
      userHints: { brand: "Maytag", model: "MED4500MW0" },
      evidenceText: "# Manual Identity Context\nModel MED4500MW0\nSerial C123",
    });

    expect(evidence).toContain("USER_HINT_MODEL: MED4500MW0");
    expect(evidence).toContain("MANUAL_CONTEXT:");
    expect(evidence).toContain("Model MED4500MW0");
  });

  it("returns raw visual truth and normalized identity for hint-only input", async () => {
    const extracted = await extractApplianceIdentity({
      files: [],
      userHints: {
        brand: "Kenmore",
        model: "110.12345678",
        productType: "Dryer",
      },
    });

    const normalized = normalizeApplianceIdentity(extracted.raw);

    expect(extracted.raw.raw_model).toBe("110.12345678");
    expect(normalized.normalized_model).toBe("110.12345678");
    expect(normalized.evidence_summary).toBe("Operator-provided identity fields.");
  });
});
