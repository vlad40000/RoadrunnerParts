import { NextResponse } from 'next/server';
import { startApplianceSearchSession, continueApplianceSearchSession } from '@/lib/parts-service';
 
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
      const payload = await continueApplianceSearchSession({ searchSessionId, revision });
      return NextResponse.json(payload);
    } else {
      // Start a new session - DATABASE-FIRST RULE is enforced inside this service
      const payload = await startApplianceSearchSession({
        modelNumber: model,
        serialNumber: serial,
        brand,
        productType,
        exhaustiveMode,
      });
      return NextResponse.json(payload);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM error';
    console.error('[BOM API] unhandled error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
