import { NextRequest, NextResponse } from 'next/server';
import { extractFeatureCues } from '@/src/lib/gemini';
import { z } from 'zod';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  frontBase64: z.string().optional().nullable(),
  interiorBase64: z.string().optional().nullable(),
  wiringBase64: z.string().optional().nullable(),
  mimeType: z.string().optional().default('image/jpeg'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { frontBase64, interiorBase64, wiringBase64, mimeType } = parsed.data;

    if (!frontBase64 && !interiorBase64 && !wiringBase64) {
      return NextResponse.json(
        { ok: false, error: 'At least one image is required' },
        { status: 400 },
      );
    }

    const cues = await extractFeatureCues({
      frontBase64: frontBase64 ?? null,
      interiorBase64: interiorBase64 ?? null,
      wiringBase64: wiringBase64 ?? null,
      mimeType,
    });

    return NextResponse.json({ ok: true, cues });
  } catch (error) {
    console.error('[extract-feature-cues] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Feature extraction failed',
        cues: { confidence: 'low', notes: 'Server error during extraction.' },
      },
      { status: 500 },
    );
  }
}
