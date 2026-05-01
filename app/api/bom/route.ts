import { NextResponse } from 'next/server';
import {
  continueApplianceSearchSession,
  startApplianceSearchSession,
} from '@/lib/parts-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Parts-only BOM route.
 *
 * No pricing.
 * No retail enrichment.
 * No AI price requirement.
 *
 * Pricing belongs only in:
 * app/api/bom/jobs/[jobId]/price/route.ts
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const modelNumber = String(body.modelNumber || body.model || body.query || '').trim();
    const serialNumber = String(body.serialNumber || body.serial || '').trim();
    const brand = body.brand || null;
    const productType = body.productType || body.applianceType || null;
    const exhaustiveMode = Boolean(body.exhaustiveMode || body.isExhaustive);
    const searchSessionId = body.searchSessionId || null;
    const revision = body.revision || null;

    if (searchSessionId) {
      const payload = await continueApplianceSearchSession({
        searchSessionId,
        revision,
      });

      return NextResponse.json(payload);
    }

    if (!modelNumber) {
      return NextResponse.json(
        { error: 'Missing modelNumber/model/query' },
        { status: 400 },
      );
    }

    const payload = await startApplianceSearchSession({
      modelNumber,
      serialNumber,
      brand,
      productType,
      exhaustiveMode,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM error';

    console.error('[BOM API] unhandled error:', error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
