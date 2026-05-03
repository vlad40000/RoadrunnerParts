export const NAMEPLATE_OCR_PROMPT = `System Role: Expert appliance nameplate OCR extractor.

Task: Extract only visible appliance identity fields from the provided nameplate image.

Rules:
1. Read the image directly. Do not search the web. Do not infer missing digits.
2. Extract exact visible values for brand, model number, serial number, engineering code, and product type.
3. Preserve punctuation exactly, including dots, slashes, hyphens, spaces, and suffixes.
4. Keep Kenmore source-code dots, for example 106.74263400 or 110.12345678.
5. Watch for lookalikes: 0/O, 1/I, 5/S, 8/B, 2/Z.
6. Use null when a field is not confidently visible.
7. Confidence must be 0.0 to 1.0 per field.
8. Return only JSON matching the schema. No commentary.`;

export const NAMEPLATE_OCR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string", nullable: true },
    productType: { type: "string", nullable: true },
    modelNumber: { type: "string", nullable: true },
    serialNumber: { type: "string", nullable: true },
    engineeringCode: { type: "string", nullable: true },
    confidence: {
      type: "object",
      properties: {
        brand: { type: "number" },
        productType: { type: "number" },
        modelNumber: { type: "number" },
        serialNumber: { type: "number" },
        engineeringCode: { type: "number" },
      },
      required: [
        "brand",
        "productType",
        "modelNumber",
        "serialNumber",
        "engineeringCode",
      ],
    },
  },
  required: [
    "brand",
    "productType",
    "modelNumber",
    "serialNumber",
    "engineeringCode",
    "confidence",
  ],
};
