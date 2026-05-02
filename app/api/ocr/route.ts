import { NextRequest, NextResponse } from 'next/server';
import { extractNameplateFromImage } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }

    const data = await extractNameplateFromImage(image, mimeType);
    
    // Derive candidates for the frontend lookup cascade
    const { getLookupCandidates } = await import('@/lib/identity-service');
    const candidates = getLookupCandidates(data.modelNumber);
    
    // Attempt decoding if serial is present
    let decodeResult = null;
    if (data.serialNumber) {
      const { ApplianceDecoder } = await import('@/lib/decoder');
      const decoder = new ApplianceDecoder();
      decodeResult = decoder.decode(data.serialNumber, data.modelNumber || '');
    }

    return NextResponse.json({
      ...data,
      candidates,
      decodeResult
    });
  } catch (error) {
    console.error('[OCR API Error]', error);
    const message = error instanceof Error ? error.message : 'Unknown OCR server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
