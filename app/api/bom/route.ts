import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SECTION_ENUM = [
  'Cover Sheet & Documentation',
  'Top and Cabinet Parts',
  'Console and Water Inlet Parts',
  'Basket and Tub Parts',
  'Gearcase, Motor, and Pump Parts',
  'Optional / Installation Parts',
  'Backsplash, Blower & Motor Assembly',
  'Blower & Exhaust',
  'Cabinet',
  'Cabinet & Top Panel',
  'Cabinet Parts',
  'Controls',
  'Drum & Motor',
  'Heater & Electrical',
];

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const {
      model,
      serial,
      manufactureDate,
      passNumber,
      passInstruction,
      knownPartNumbers = [],
    } = await req.json();

    if (!model) {
      return NextResponse.json({ error: 'Missing model' }, { status: 400 });
    }

    const generativeModel = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            modelMSRP: { type: 'NUMBER' },
            parts: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'NUMBER' },
                  partNumber: { type: 'STRING' },
                  description: { type: 'STRING' },
                  section: {
                    type: 'STRING',
                    enum: SECTION_ENUM,
                  },
                  compatibleModels: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                  },
                  avgRating: { type: 'NUMBER' },
                  reviewCount: { type: 'NUMBER' },
                  price: { type: 'NUMBER' },
                  priceSource: { type: 'STRING' },
                },
                required: [
                  'id',
                  'partNumber',
                  'description',
                  'section',
                  'compatibleModels',
                  'avgRating',
                  'reviewCount',
                  'price',
                  'priceSource',
                ],
              },
            },
          },
          required: ['parts'],
        },
      },
      tools: [{ googleSearch: {} }],
    } as any);

    const prompt = `Generate an ABSOLUTELY EXHAUSTIVE, MASTER-LEVEL Bill of Materials (BOM) for appliance model: ${model}.
${serial ? `Serial Number: ${serial}` : ''}
${manufactureDate ? `Approximate Manufacture Date: ${manufactureDate}` : ''}

CURRENT PASS NUMBER: ${passNumber}

${passInstruction}

KNOWN PART NUMBERS ALREADY FOUND:
${knownPartNumbers.length > 0 ? knownPartNumbers.join(', ') : 'NONE'}

First, identify the Brand and Category.
I require the deepest possible OEM service BOM.
Use REAL OEM part numbers for the identified manufacturer.
Categorize strictly into the provided assembly sections.

CRITICAL:
- Search for missing parts that are NOT already in the known list.
- Prefer exact OEM part numbers.
- Focus on completeness.
- Return only valid serviceable or diagram-listed parts.
- Avoid duplicates of known part numbers.

ALSO:
Use GOOGLE SEARCH to verify the EXACT CURRENT RETAIL PRICE for each part.
For EVERY price provided, specify the source website.
Focus specifically on Encompass.com.

Return a JSON object with two keys:
- "parts" (array)
- "modelMSRP" (number, optional if high confidence only).`;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const response = await result.response;
    const text = response.text()?.trim() || '{"parts": []}';
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
