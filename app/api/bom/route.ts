import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { findCachedModelParts, normalizeModelKey, upsertModelPartsCache } from '../../../src/features/bom/services/model-parts-cache';
import { orchestrateBomRetrieval } from '../../../src/features/bom/services/bom-orchestrator';
import { db } from '../../../src/server/db';
import { modelSources } from '../../../src/server/db/schema/model-sources';

export const runtime = 'nodejs';
export const maxDuration = 120; // Extended to support Google Search + Thinking

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const BOM_ROUTE_DEADLINE_MS = 110000;
export const APPROVED_PRICE_SOURCES = [
  'fix.com',
  'repairclinic.com',
  'appliancepartspros.com',
  'searspartsdirect.com',
] as const;

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

/**
 * Helpers for robust BOM extraction
 */
const elapsedMs = (start: number) => Date.now() - start;

function extractJsonCandidate(text: string) {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const source = jsonBlockMatch ? jsonBlockMatch[1] : text;

  const firstBrace = source.indexOf('{');
  if (firstBrace === -1) return source;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(firstBrace, index + 1);
      }
    }
  }

  return source.slice(firstBrace);
}

function logParseDiagnostics(text: string, err: any) {
  console.error('[BOM API] JSON Parse Error:', err instanceof Error ? err.message : String(err));
  console.error('[BOM API] Raw Output Length:', text.length);
  console.error('[BOM API] Output Preview:', text.slice(0, 200) + '...');
}

function normalizePriceSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return APPROVED_PRICE_SOURCES.find((approved) => {
    const regex = new RegExp(`(^|\\.)` + approved.replace('.', '\\.') + `($|/|\\?|#|$)`, 'i');
    return regex.test(source);
  }) || '';
}

function hasInvalidMarketPrices(parts: any[] | null | undefined) {
  return Array.isArray(parts)
    ? parts.some((part) => {
        const price = Number(part?.price);
        return !Number.isFinite(price) || price <= 0 || !normalizePriceSource(part?.priceSource);
      })
    : false;
}

export function normalizeGeneratedParts(parts: any[] | null | undefined) {
  if (!Array.isArray(parts)) return [];

  return parts.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];

    // Fallback logic for scrapers (which use retailPrice) vs AI (which uses price)
    const rawPrice = part.price ?? part.retailPrice;
    const rawSource = part.priceSource ?? part.retailPriceSource;

    const price = Number(rawPrice);
    const priceSource = normalizePriceSource(rawSource);
    
    // We still require a price to consider the part "valid" for the final BOM
    if (!Number.isFinite(price) || price <= 0 || !priceSource) {
      return [];
    }

    return [{
      ...part,
      price,
      priceSource,
    }];
  });
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
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
      promptOverride,
      knownPartNumbers = [],
      isExhaustive = false,
      expectedPartCount = null,
    } = await req.json();
    const hasPromptOverride =
      typeof promptOverride === 'string' && promptOverride.trim().length > 0;

    if (!model) {
      return NextResponse.json({ error: 'Missing model' }, { status: 400 });
    }

    // ✅ CACHE CHECK — return instantly if we've seen this model before
    const isFirstPass = !knownPartNumbers || knownPartNumbers.length === 0;
    if (isFirstPass) {
      const cached = await findCachedModelParts(model);
      if (cached) {
        const cachedIsExhaustive = cached.isExhaustive === 'true';
        if (hasInvalidMarketPrices(cached.parts)) {
          console.log(`[BOM Route] Cache/seed HIT for ${normalizeModelKey(model)} but pricing is incomplete or unapproved; continuing retrieval`);
          cached.parts = null;
        }
        if (!cached.parts) {
          console.log(`[BOM Route] Cache MISS for ${normalizeModelKey(model)} after pricing validation`);
        } else {
        console.log(`[BOM Route] Cache HIT for ${normalizeModelKey(model)} (Exhaustive: ${cachedIsExhaustive}) — returning stored data`);
        
        return NextResponse.json({
          parts: normalizeGeneratedParts(cached.parts),
          modelMSRP: cached.msrp ? parseFloat(cached.msrp) : undefined,
          fromCache: true,
          isExhaustive: cachedIsExhaustive,
        });
        }
      }
      if (!hasPromptOverride) {
      console.log(`[BOM Route] Cache MISS for ${normalizeModelKey(model)} — checking deterministic sources`);
      try {
        const result = await orchestrateBomRetrieval({
          brand: null,
          model,
          serial,
          expectedPartCount,
        });

        if (result.sourceType === 'deterministic' && result.parts.length > 0) {
          console.log(`[BOM Route] DETERMINISTIC HIT for ${normalizeModelKey(model)} — Found ${result.parts.length} parts`);
          
          upsertModelPartsCache({
            model,
            parts: result.parts,
            msrp: result.modelMSRP,
            isExhaustive: result.isExhaustive || false,
          }).catch(err => console.error('[BOM Route] Cache write failed (deterministic):', err));

          return NextResponse.json({
            parts: result.parts,
            modelMSRP: result.modelMSRP,
            fromCache: false,
            isExhaustive: result.isExhaustive,
            source: 'deterministic',
          });
        }
      } catch (detError) {
        console.error('[BOM Route] Deterministic extraction failed:', detError);
      }
      console.log(`[BOM Route] Deterministic path yielded no results — calling Gemini`);
      }
    }

    if (hasPromptOverride) {
      console.log(`[BOM Route] Prompt override supplied for ${normalizeModelKey(model)} after DB cache check`);
    }

    const generativeModel = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      generationConfig: {
        temperature: 1.0,          // Gemini 3 default — never go below 1.0
        maxOutputTokens: 32000,    // Enough headroom for 150+ part BOMs as JSON
        thinkingConfig: {
          thinkingLevel: 'medium', // Low cuts off too early for multi-section BOM planning
        },
        responseMimeType: 'application/json',
        // NOTE: No responseSchema — the strict section enum was silently dropping
        // parts mid-generation whenever a section name didn't exactly match.
        // We enforce structure via the prompt instead.
      },
      tools: [{ googleSearch: {} }],
    } as any);

    const prompt = promptOverride || `You are an expert appliance parts researcher. Generate a Bill of Materials (BOM) for appliance model: ${model}.
${serial ? `Serial Number: ${serial}` : ''}
${manufactureDate ? `Approximate Manufacture Date: ${manufactureDate}` : ''}
${expectedPartCount ? `EXPECTED TOTAL PART COUNT (OEM BOM): ${expectedPartCount}` : ''}

CURRENT PASS NUMBER: ${passNumber}

${passInstruction}

KNONW PART NUMBERS ALREADY FOUND (DO NOT REPEAT THESE):
${knownPartNumbers.length > 0 ? knownPartNumbers.join(', ') : 'NONE'}

INSTRUCTIONS:
- Use GOOGLE SEARCH to find the actual OEM parts list for this exact model on searspartsdirect.com, fix.com, repairclinic.com, or appliancepartspros.com.
- Use REAL manufacturer OEM part numbers only.
- Do NOT include any part number already in the known list above.
- Return only valid, serviceable, or diagram-listed parts that also have a verified positive market price from the required pricing fallback chain.
- TARGET: Return approximately 40 parts per pass. 
- BATCHING LOGIC: If an EXPECTED TOTAL PART COUNT is provided, continue targeting ~40 parts per pass until the remaining count is less than 40, then deliver only that remainder.
- If the real OEM BOM has fewer than 40 serviceable parts total, return all of them and stop immediately — do NOT invent or pad parts.
- Only return parts that genuinely exist in OEM service documentation or real parts retailer sites for this exact model.
- Pricing is mandatory for every returned part: search searspartsdirect.com, or fix.com.
- Do not return 0, $0.00, free, blank, placeholder, or estimated prices.
- Every returned part MUST include a real positive "price" and "priceSource".
- Set "priceSource" to exactly "searspartsdirect.com", or "fix.com".
- Do not use any other retailer, marketplace, blog, unrelated URL, or manufacturer landing page as a price source.

OUTPUT FORMAT — return ONLY a valid JSON object, no markdown, no explanation:
{
  "parts": [
    {
      "id": 1,
      "partNumber": "WP12345678",
      "description": "Drive Motor",
      "section": "Gearcase, Motor, and Pump Parts",
      "compatibleModels": ["${model}"],
      "avgRating": 4.5,
      "reviewCount": 120,
      "price": 89.99,
      "priceSource": "encompass.com"
    }
  ],
  "modelMSRP": 799.00
}

Valid section values: ${SECTION_ENUM.join(', ')}.
If a part does not fit any section, use the closest match — never omit a part because of section uncertainty.`;

    const aiCallStartedAt = Date.now();
    let rawText = '{"parts": []}';
    try {
      const result = await generativeModel.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        },
        { timeout: BOM_ROUTE_DEADLINE_MS },
      );
      const response = await result.response;
      rawText = response.text() || '{"parts": []}';
      console.log('[BOM API] AI call completed in ms:', elapsedMs(aiCallStartedAt));
    } catch (aiError) {
      const aiMessage = aiError instanceof Error ? aiError.message : String(aiError);
      const looksLikeTimeout = /aborted|timeout/i.test(aiMessage);
      if (looksLikeTimeout) {
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
      throw aiError;
    }

    const parseStartedAt = Date.now();
    const jsonCandidate = extractJsonCandidate(rawText);

    // DB-FIRST: Log the raw AI output before parsing
    await db.insert(modelSources).values({
      normalizedModel: normalizeModelKey(model),
      source: 'gemini-3.1-flash-lite-preview',
      sourceUrl: 'ai-generation',
      raw: { prompt, output: rawText },
      status: 'completed'
    }).catch(err => console.error('[BOM API] AI Raw logging failed:', err));

    try {
      const parsed = JSON.parse(jsonCandidate);
      parsed.parts = normalizeGeneratedParts(parsed.parts);
      if (parsed.parts.length === 0) {
        return NextResponse.json(
          {
            error: 'No BOM rows had approved positive prices.',
            detail: 'Only Fix.com, RepairClinic, AppliancePartsPros, and SearsPartsDirect prices are allowed.',
          },
          { status: 502 },
        );
      }
      
      // ✅ CACHE WRITE — store results after a successful first-pass response
      if (isFirstPass && parsed.parts?.length > 0) {
        // Only mark as exhaustive if it truly matches the expected total (if known)
        const actuallyExhaustive = isExhaustive && (
          expectedPartCount !== null 
            ? parsed.parts.length >= expectedPartCount 
            : false // Default to false if we don't know the total but requested exhaustive
        );

        upsertModelPartsCache({
          model,
          parts: parsed.parts,
          msrp: parsed.modelMSRP,
          isExhaustive: actuallyExhaustive,
        }).catch(err => console.error('[BOM Route] Cache write failed:', err));
      }

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
