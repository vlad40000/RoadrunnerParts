export const NAMEPLATE_OCR_PROMPT = `System Role: Expert appliance nameplate OCR extractor.

Task: Read the provided nameplate image and extract only visible identity fields.

Return exact visible values for: brand, productType, modelNumber, serialNumber, engineeringCode.
Rules:
- Do not infer missing characters.
- Preserve punctuation and spacing exactly.
- Use null when a field is not clearly visible.
- Set confidence per field from 0.0 to 1.0.
- Return JSON only.`;

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
