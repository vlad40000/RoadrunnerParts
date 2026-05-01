import { NextRequest, NextResponse } from 'next/server';
import {
  fetchFixModelPage,
  parseFixDiagramLinks,
  parseFixPartCount,
} from '@/src/features/bom/services/providers/fix-com';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const jobId = String(body?.jobId || '').trim();
    const model = String(body?.model || '').trim();
    const brand = String(body?.brand || '').trim() || null;
    const productType = String(body?.productType || '').trim() || null;

    if (!model) {
      return NextResponse.json({ error: 'Missing model' }, { status: 400 });
    }

    const page = await fetchFixModelPage({
      model,
      brand,
      productType,
    });

    if (!page) {
      return NextResponse.json({
        found: false,
        expectedPartsTotal: 0,
        expectedPartsSource: 'Fix.com model page not found',
        matchedModel: model.toUpperCase(),
        modelUrl: null,
        method: 'fix_model_page_missing',
        confidence: 0,
        jobId,
      });
    }

    const count = parseFixPartCount(page.html);
    const diagrams = parseFixDiagramLinks(page.html, page.url);
    const expectedPartsTotal = count.totalPartsAvailable ?? null;

    if (expectedPartsTotal && expectedPartsTotal > 0) {
      return NextResponse.json({
        found: true,
        expectedPartsTotal,
        expectedPartsSource: 'Fix.com model page',
        matchedModel: model.toUpperCase(),
        modelUrl: page.url,
        method: 'fix_model_page_count',
        confidence: 0.98,
        evidence: count.evidence,
        diagramCount: diagrams.length,
        jobId,
      });
    }

    return NextResponse.json({
      found: false,
      expectedPartsTotal: 0,
      expectedPartsSource: 'Fix.com model page has no visible total parts count',
      matchedModel: model.toUpperCase(),
      modelUrl: page.url,
      method: 'fix_model_page_no_count',
      confidence: diagrams.length > 0 ? 0.5 : 0,
      evidence: count.evidence,
      diagramCount: diagrams.length,
      jobId,
    });
  } catch (error) {
    console.error('[ExpectedCount API] Error:', error);

    return NextResponse.json(
      {
        found: false,
        expectedPartsTotal: 0,
        expectedPartsSource: 'Error during Fix.com expected count resolution',
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'fix_model_page_error',
        confidence: 0,
      },
      { status: 500 },
    );
  }
}
