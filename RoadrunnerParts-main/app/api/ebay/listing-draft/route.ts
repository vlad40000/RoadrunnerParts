import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function cleanText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getPartNumber(part: any): string {
  return cleanText(
    part?.currentServicePartNumber ||
      part?.originalPartNumber ||
      part?.partNumber ||
      part?.part_number ||
      '',
  ).toUpperCase();
}

function getDescription(part: any): string {
  return cleanText(
    part?.description ||
      part?.name ||
      part?.partDescription ||
      part?.part_description ||
      'Appliance Part',
  );
}

function buildSuggestedPrice(summary: any): number | null {
  const median =
    typeof summary?.medianSoldPrice === 'number'
      ? summary.medianSoldPrice
      : typeof summary?.medianPrice === 'number'
        ? summary.medianPrice
        : null;

  if (!median || !Number.isFinite(median) || median <= 0) return null;

  const suggested = median * 0.92;

  return Math.round(suggested * 100) / 100;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const part = body?.part || {};
    const summary = body?.summary || {};
    const model = cleanText(body?.model);

    const partNumber = getPartNumber(part);
    const description = getDescription(part);
    const suggestedPrice = buildSuggestedPrice(summary);

    if (!partNumber) {
      return NextResponse.json(
        { error: 'Missing part number for listing draft.' },
        { status: 400 },
      );
    }

    const titleBase = `${partNumber} ${description}`.slice(0, 80);

    const title = model
      ? `${titleBase} for ${model}`.slice(0, 80)
      : titleBase;

    const descriptionLines = [
      `${description}`,
      '',
      `Part Number: ${partNumber}`,
      model ? `Pulled from / compatible reference model: ${model}` : '',
      '',
      'Used OEM appliance part.',
      'Inspect photos and part number before purchase.',
      'Buyer is responsible for confirming compatibility with their appliance model.',
      '',
      'Condition: Used, tested/inspected unless otherwise noted.',
    ].filter(Boolean);

    const listingNotes = [
      'Use clear photos of the front, back, label, connector, and any wear points.',
      'Do not claim universal compatibility unless verified.',
      'Use sold comps to adjust final price manually.',
      'Do not use this eBay price as verified retail pricing in the BOM.',
    ];

    return NextResponse.json({
      title,
      description: descriptionLines.join('\n'),
      suggestedPrice,
      listingNotes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate eBay listing draft.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
