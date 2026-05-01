import { NextRequest, NextResponse } from 'next/server';
import { runIdentityExtractor } from '@/src/features/bom/agents/identity-extractor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const {
      image,
      mimeType = 'image/jpeg',
      userHints = {},
    } = await req.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Missing image data' },
        { status: 400 },
      );
    }

    const identity = await runIdentityExtractor({
      files: [
        {
          mimeType,
          data: image,
        },
      ],
      userHints,
    });

    const modelNumber = identity.model || null;
    const serialNumber = identity.serial || null;

    const { getLookupCandidates } = await import('@/lib/identity-service');
    const candidates = getLookupCandidates(modelNumber);

    let decodeResult = null;

    if (serialNumber) {
      try {
        const { decodeSerialNumber } = await import('@/lib/serial/decoder');

        decodeResult = await decodeSerialNumber(serialNumber, {
          brand: identity.brand,
          model: modelNumber,
        });
      } catch (error) {
        console.warn('[OCR API] Serial decode skipped:', error);
      }
    }

    return NextResponse.json({
      ...identity,
      modelNumber,
      serialNumber,
      candidates,
      decodeResult,
    });
  } catch (error) {
    console.error('[OCR API Error]', error);

    const message =
      error instanceof Error ? error.message : 'Unknown OCR server error';

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
