import { NextResponse } from 'next/server';

 
export const runtime = 'nodejs';
export const maxDuration = 120; // Extended to support Google Search + Thinking

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
    }
    const {
      model,
      serial,
      brand,
      productType,
      exhaustiveMode,
      searchSessionId,
      revision, // For variant resolution
    } = await req.json();

    if (!model) {
      return NextResponse.json({ error: 'Missing model' }, { status: 400 });
    }

    if (searchSessionId) {
      // Continue an existing session (e.g. after variant resolution or for price enrichment)
      // Note: New orchestrator doesn't currently support session continuation via this path
      return NextResponse.json({ error: 'Session continuation not supported' }, { status: 501 });
    } else {
      const { orchestrateBomRetrieval } = await import('@/features/bom/services/bom-orchestrator');
      const payload = await orchestrateBomRetrieval({
        model: model,
        brand: brand || null,
        serial: serial || null,
      });
      return NextResponse.json(payload);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM error';
    console.error('[BOM API] unhandled error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
