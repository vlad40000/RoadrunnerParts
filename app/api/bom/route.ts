import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scheduleGeminiCall } from '../../../src/lib/gemini-call-scheduler';
import { findCachedModelParts, normalizeModelKey, upsertModelPartsCache } from '../../../src/features/bom/services/model-parts-cache';
import { orchestrateBomRetrieval } from '../../../src/features/bom/services/bom-orchestrator';
import { hydrateBomPricesFromDb, buildPricingSummary } from '../../../src/features/bom/services/part-pricing-hydrator';
import { findNextDbBomBatch } from '../../../src/features/bom/services/db-bom-batch';
import { db } from '../../../src/server/db';
import { modelSources } from '../../../src/server/db/schema/model-sources';

export const runtime = 'nodejs';
export const maxDuration = 120; // Extended to support Google Search + Thinking

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const BOM_MODEL = process.env.BOM_LITE_MODEL || process.env.GEMINI_LITE_MODEL || 'gemini-3.1-flash-lite';

const BOM_ROUTE_DEADLINE_MS = 110000;
export const APPROVED_PRICE_SOURCES = [
  'encompass.com',
  'encompass',
  'reliableparts.com',
  'reliableparts',
  'dlparts.com',
  'dlparts',
  'd&lparts',
  'd&l parts',
  'fix.com',
  'repairclinic.com',
  'appliancepartspros.com',
  'searspartsdirect.com',
  'partselect.com',
  'partsdr.com',
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
    const escaped = approved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\.|\\b)` + escaped + `($|/|\\?|#|\\b)`, 'i');
    return regex.test(source);
  }) || '';
}

export function normalizeGeneratedParts(parts: any[] | null | undefined) {
  if (!Array.isArray(parts)) return [];

  return parts.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];

    const rawPrice = part.price ?? part.retailPrice;
    const rawSource = part.priceSource ?? part.retailPriceSource;

    const price = Number(rawPrice);
    const priceSource = normalizePriceSource(rawSource);

    // Model-supplied pricing is allowed only when it names an approved supplier.
    // The supplier DB hydration layer below remains the authority and will overwrite this.
    const hasApprovedPrice = Number.isFinite(price) && price > 0 && !!priceSource;

    return [{
      ...part,
      price: hasApprovedPrice ? price : null,
      priceSource: hasApprovedPrice ? priceSource : (rawSource ? String(rawSource) : 'supplier_price_required'),
      priceVerified: hasApprovedPrice,
      pricingRequired: !hasApprovedPrice,
    }];
  });
}

async function finalizeBomParts(input: { model: string; parts: any[] }) {
  const normalized = normalizeGeneratedParts(input.parts);
  const priced = await hydrateBomPricesFromDb({ model: input.model, parts: normalized });
  return {
    parts: priced,
    pricingSummary: buildPricingSummary(priced),
  };
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

    const excludePartNumbers = Array.isArray(knownPartNumbers) ? knownPartNumbers : [];

    // DB-FIRST SOURCE-BACKED BATCH — applies to first pass and continuation passes.
    // If provider/retrieval rows exist, return them before cache/deterministic/Gemini so the app does not burn model calls for rows already known.
    const dbBatch = await findNextDbBomBatch({
      model,
      excludePartNumbers,
      limit: 40,
    });

    if (dbBatch.parts.length > 0) {
      const finalized = await finalizeBomParts({ model, parts: dbBatch.parts });
      console.log(`[BOM Route] DB-FIRST batch for ${normalizeModelKey(model)} — returned ${finalized.parts.length}/${dbBatch.totalSourceBackedParts}; priced ${finalized.pricingSummary.priced}/${finalized.pricingSummary.total}`);

      if (!excludePartNumbers.length) {
        upsertModelPartsCache({
          model,
          parts: finalized.parts,
          isExhaustive: dbBatch.retrievalState === 'bom_complete',
        }).catch(err => console.error('[BOM Route] Cache write failed (db batch):', err));
      }

      return NextResponse.json({
        parts: finalized.parts,
        pricingSummary: finalized.pricingSummary,
        pricingRequired: finalized.pricingSummary.missing > 0,
        fromCache: false,
        source: dbBatch.source,
        retrievalState: dbBatch.retrievalState,
        isExhaustive: dbBatch.retrievalState === 'bom_complete',
        totalSourceBackedParts: dbBatch.totalSourceBackedParts,
        returnedPartCount: dbBatch.returnedPartCount,
        remainingPartCount: dbBatch.remainingPartCount,
        excludedPartCount: dbBatch.excludedPartCount,
      });
    }

    // CACHE CHECK — return instantly if we've seen this model before. Pricing is still hydrated from supplier DB.
    const isFirstPass = excludePartNumbers.length === 0;
    if (isFirstPass) {
      const cached = await findCachedModelParts(model);
      if (cached?.parts && Array.isArray(cached.parts) && cached.parts.length > 0) {
        const cachedIsExhaustive = cached.isExhaustive === 'true';
        const finalized = await finalizeBomParts({ model, parts: cached.parts });
        console.log(`[BOM Route] Cache HIT for ${normalizeModelKey(model)} (Exhaustive: ${cachedIsExhaustive}) — returning stored data with supplier pricing`);

        return NextResponse.json({
          parts: finalized.parts,
          pricingSummary: finalized.pricingSummary,
          pricingRequired: finalized.pricingSummary.missing > 0,
          modelMSRP: cached.msrp ? parseFloat(cached.msrp) : undefined,
          fromCache: true,
          isExhaustive: cachedIsExhaustive,
          retrievalState: cachedIsExhaustive ? 'bom_complete' : 'parts_partial',
        });
      }

      console.log(`[BOM Route] Cache MISS for ${normalizeModelKey(model)} — checking deterministic sources`);
      try {
        const result = await orchestrateBomRetrieval({
          brand: null,
          model,
          serial,
          expectedPartCount,
        });

        if (result.sourceType === 'deterministic' && result.parts.length > 0) {
          const finalized = await finalizeBomParts({ model, parts: result.parts });
          console.log(`[BOM Route] DETERMINISTIC HIT for ${normalizeModelKey(model)} — Found ${finalized.parts.length} parts; priced ${finalized.pricingSummary.priced}/${finalized.pricingSummary.total}`);

          upsertModelPartsCache({
            model,
            parts: finalized.parts,
            msrp: result.modelMSRP,
            isExhaustive: result.isExhaustive || false,
          }).catch(err => console.error('[BOM Route] Cache write failed (deterministic):', err));

          return NextResponse.json({
            parts: finalized.parts,
            pricingSummary: finalized.pricingSummary,
            pricingRequired: finalized.pricingSummary.missing > 0,
            modelMSRP: result.modelMSRP,
            fromCache: false,
            isExhaustive: result.isExhaustive,
            retrievalState: result.isExhaustive ? 'bom_complete' : 'parts_partial',
            source: 'deterministic',
          });
        }
      } catch (detError) {
        console.error('[BOM Route] Deterministic extraction failed:', detError);
      }
      console.log(`[BOM Route] Deterministic path yielded no results — calling Gemini`);
    }

    if (hasPromptOverride) {
      console.log(`[BOM Route] Prompt override supplied for ${normalizeModelKey(model)} after DB cache check`);
    }

    const generativeModel = genAI.getGenerativeModel({
      model: BOM_MODEL,
      generationConfig: {
        temperature: 1.0,          // Gemini 3 default — never go below 1.0
        maxOutputTokens: 32000,    // Enough headroom for 150+ part BOMs as JSON
        thinkingConfig: {
          thinkingLevel: 'medium', // Low cuts off too early for multi-section BOM planning
        },
        responseMimeType: 'application/json',
      },
      tools: [{ googleSearch: {} }],
    } as any);

    const resolvedPassInstruction =
      typeof passInstruction === 'string' && passInstruction.trim().length > 0
        ? passInstruction
        : `QUICK BOM PASS:
Target approximately 40 valid OEM parts with broad coverage across major categories.
Prioritize rows that can also be priced from approved suppliers.`;

    const approvedSupplierList = APPROVED_PRICE_SOURCES.join(', ');
    const prompt = promptOverride || `You are an expert appliance parts researcher. Generate a Bill of Materials (BOM) for appliance model: ${model}.
${serial ? `Serial Number: ${serial}` : ''}
${manufactureDate ? `Approximate Manufacture Date: ${manufactureDate}` : ''}
${expectedPartCount ? `EXPECTED TOTAL PART COUNT (OEM BOM): ${expectedPartCount}` : ''}

CURRENT PASS NUMBER: ${passNumber}

${resolvedPassInstruction}

KNOWN PART NUMBERS ALREADY FOUND (DO NOT REPEAT THESE):
${knownPartNumbers.length > 0 ? knownPartNumbers.join(', ') : 'NONE'}

INSTRUCTIONS:
- Use GOOGLE SEARCH to find the actual OEM parts list for this exact model on searspartsdirect.com, encompass.com, reliableparts.com, dlparts.com, fix.com, repairclinic.com, appliancepartspros.com, partsdr.com, or partselect.com.
- Use REAL manufacturer OEM part numbers only.
- Do NOT include any part number already in the known list above.
- Return valid, serviceable, or diagram-listed parts.
- Pricing is a priority: for each returned part, attempt to find supplier pricing from these approved suppliers: ${approvedSupplierList}.
- Do not invent prices. If no approved supplier price is found, set "price" to null and set "priceSource" to "supplier_price_required".
- Do not use $0.00 placeholders.
- TARGET: Return approximately 40 parts per pass.
- BATCHING LOGIC: If an EXPECTED TOTAL PART COUNT is provided, continue targeting ~40 parts per pass until the remaining count is less than 40, then deliver only that remainder.
- If the real OEM BOM has fewer than 40 serviceable parts total, return all of them and stop immediately — do NOT invent or pad parts.
- Only return parts that genuinely exist in OEM service documentation or real parts retailer sites for this exact model.

OUTPUT FORMAT — return ONLY a valid JSON object, no markdown, no explanation:
{
  "parts": [
    {
      "id": 1,
      "partNumber": "WP12345678",
      "description": "Drive Motor",
      "section": "Gearcase, Motor, and Pump Parts",
      "compatibleModels": ["${model}"],
      "avgRating": 0,
      "reviewCount": 0,
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
      const result = await scheduleGeminiCall({
        tool: 'bom',
        bucket: 'lite',
        model: BOM_MODEL,
        grounded: true,
        route: 'app/api/bom',
        requestId: normalizeModelKey(model),
        run: () => generativeModel.generateContent(
          {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          },
          { timeout: BOM_ROUTE_DEADLINE_MS },
        ),
      });
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
      source: BOM_MODEL,
      sourceUrl: 'ai-generation',
      raw: { prompt, output: rawText },
      status: 'completed'
    }).catch(err => console.error('[BOM API] AI Raw logging failed:', err));

    try {
      const parsed = JSON.parse(jsonCandidate);
      const finalized = await finalizeBomParts({ model, parts: parsed.parts });
      parsed.parts = finalized.parts;
      parsed.pricingSummary = finalized.pricingSummary;
      parsed.pricingRequired = finalized.pricingSummary.missing > 0;
      parsed.retrievalState = finalized.parts.length > 0 ? 'parts_partial' : 'no_result';

      // Graceful empty — 200 with flag so the UI degrades instead of hard erroring
      if (parsed.parts.length === 0) {
        return NextResponse.json({
          parts: [],
          pricingSummary: finalized.pricingSummary,
          pricingRequired: true,
          noPricedParts: true,
          priceNote: 'No source-backed parts were returned. Try again or check a parts retailer directly.',
          retrievalState: 'no_result',
        });
      }

      // CACHE WRITE — store results after a successful first-pass response
      if (isFirstPass && parsed.parts?.length > 0) {
        const actuallyExhaustive = isExhaustive && (
          expectedPartCount !== null
            ? parsed.parts.length >= expectedPartCount
            : false
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
