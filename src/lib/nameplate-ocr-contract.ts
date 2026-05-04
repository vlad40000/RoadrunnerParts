export const NAMEPLATE_OCR_PROMPT = `Act: Act as a strict deterministic OCR extractor for appliance nameplates.

Input: One attached appliance nameplate image.

Mission: Extract only directly visible appliance identity fields from the image.

Rules:
- Extract exact visible values for brand, productType, modelNumber, and serialNumber.
- Preserve punctuation exactly as printed, including slashes, hyphens, dots, and suffixes.
- Do not search the web.
- Do not infer missing characters.
- Do not normalize model numbers unless the printed value is clearly visible.
- If a field is not confidently visible, return null.
- Do not return confidence scores, engineering codes, notes, or explanations.

Output:
Return exactly and only valid JSON.

Schema:
{
  "brand": string | null,
  "productType": string | null,
  "modelNumber": string | null,
  "serialNumber": string | null
}`;

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
