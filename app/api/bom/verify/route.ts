import { NextResponse } from 'next/server';
import { verifyPartNumber } from '../../../../src/features/bom/services/retail-pricing';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { partNumber, model } = await req.json();

    if (!partNumber) {
      return NextResponse.json({ error: 'Missing partNumber' }, { status: 400 });
    }

    const result = await verifyPartNumber({
      model,
      partNumber,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
