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

const BOM_ROUTE_DEADLINE_MS = parseInt(process.env.BOM_ROUTE_DEADLINE_MS || '25000', 10);

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '{"parts": []}';

  // Best case: already pure JSON.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  // Handle fenced output (```json ... ```).
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Fallback: pull the largest object-looking range.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function logParseDiagnostics(rawText: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const posMatch = message.match(/position\s+(\d+)/i);
  const position = posMatch ? Number.parseInt(posMatch[1], 10) : -1;

  if (position >= 0) {
    const start = Math.max(0, position - 140);
    const end = Math.min(rawText.length, position + 140);
    const context = rawText.slice(start, end);
    console.error('[BOM API] JSON parse failed near position', position, 'context:', context);
  }

  console.error('[BOM API] JSON parse error:', message);
  console.error('[BOM API] raw payload preview:', rawText.slice(0, 4000));
}

function elapsedMs(since: number) {
  return Date.now() - since;
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();

  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }

    const bodyParseStartedAt = Date.now();
    const {
      model,
      serial,
      manufactureDate,
      passNumber,
      passInstruction,
      knownPartNumbers = [],
    } = await req.json();
    console.log('[BOM API] request body parsed in ms:', elapsedMs(bodyParseStartedAt));

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

    const aiCallStartedAt = Date.now();
    const aiCall = generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const timeoutResult = await Promise.race([
      aiCall.then(async (result) => {
        const response = await result.response;
        const rawText = response.text() || '{"parts": []}';
        return { timedOut: false as const, rawText };
      }),
      new Promise<{ timedOut: true }>((resolve) => {
        setTimeout(() => resolve({ timedOut: true }), BOM_ROUTE_DEADLINE_MS);
      }),
    ]);

    if (timeoutResult.timedOut) {
      console.warn('[BOM API] AI call deadline exceeded at ms:', elapsedMs(aiCallStartedAt));
      return NextResponse.json(
        {
          error: 'BOM generation timed out before completion.',
          partial: { parts: [] },
          timedOut: true,
        },
        { status: 504 },
      );
    }

    console.log('[BOM API] AI call completed in ms:', elapsedMs(aiCallStartedAt));

    const parseStartedAt = Date.now();
    const rawText = ('rawText' in timeoutResult ? timeoutResult.rawText : '{\"parts\": []}');
    const jsonCandidate = extractJsonCandidate(rawText);

    try {
      const parsed = JSON.parse(jsonCandidate);
      console.log('[BOM API] parse completed in ms:', elapsedMs(parseStartedAt));
      console.log('[BOM API] total request time ms:', elapsedMs(requestStartedAt));
      return NextResponse.json(parsed);
    } catch (parseError) {
      logParseDiagnostics(rawText, parseError);
      return NextResponse.json(
        {
          error: 'Invalid JSON returned by model output.',
          detail: parseError instanceof Error ? parseError.message : String(parseError),
        },
        { status: 500 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM error';
    console.error('[BOM API] unhandled error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
