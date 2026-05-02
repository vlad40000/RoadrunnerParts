import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type EbayListing = {
  title: string;
  price: number | null;
  priceText: string | null;
  shippingText: string | null;
  sold: boolean;
  raw: string;
};

function parseMoney(value: string): number | null {
  const match = value.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanLine(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseVisibleEbayText(input: string): EbayListing[] {
  const text = String(input || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  const lines = text
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);

  const listings: EbayListing[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const hasPrice = /\$\s*\d/.test(line);
    const looksLikeTitle =
      line.length >= 8 &&
      !/^sponsored$/i.test(line) &&
      !/^save this search$/i.test(line) &&
      !/^shop on ebay$/i.test(line) &&
      !/^results matching fewer words$/i.test(line);

    if (!looksLikeTitle) continue;

    let priceText: string | null = null;
    let price: number | null = null;
    let shippingText: string | null = null;
    const rawChunk = lines.slice(i, i + 8).join(' | ');

    if (hasPrice) {
      const priceMatch = line.match(/\$\s*[\d,]+(?:\.\d{1,2})?/);
      priceText = priceMatch?.[0] || null;
      price = priceText ? parseMoney(priceText) : null;
    } else {
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j += 1) {
        if (/\$\s*\d/.test(lines[j])) {
          const priceMatch = lines[j].match(/\$\s*[\d,]+(?:\.\d{1,2})?/);
          priceText = priceMatch?.[0] || null;
          price = priceText ? parseMoney(priceText) : null;
          break;
        }
      }
    }

    for (let j = i; j < Math.min(lines.length, i + 8); j += 1) {
      if (/shipping|free delivery|free shipping/i.test(lines[j])) {
        shippingText = lines[j];
        break;
      }
    }

    if (!priceText || price === null) continue;

    const sold = /sold|completed|ended/i.test(rawChunk);

    listings.push({
      title: line,
      price,
      priceText,
      shippingText,
      sold,
      raw: rawChunk,
    });
  }

  const seen = new Set<string>();

  return listings.filter((listing) => {
    const key = `${listing.title.toLowerCase()}-${listing.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const html = String(body?.html || body?.text || '');

    if (!html.trim()) {
      return NextResponse.json(
        { error: 'Missing eBay page text.' },
        { status: 400 },
      );
    }

    const listings = parseVisibleEbayText(html);

    return NextResponse.json({
      listings,
      count: listings.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to parse eBay page text.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
