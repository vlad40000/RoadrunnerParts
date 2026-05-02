import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type EbayListing = {
  title?: string;
  price?: number | null;
  sold?: boolean;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listings: EbayListing[] = Array.isArray(body?.listings)
      ? body.listings
      : [];

    const validPrices = listings
      .map((listing) => listing.price)
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);

    const soldListings = listings.filter((listing) => Boolean(listing.sold));
    const activeListings = listings.filter((listing) => !listing.sold);

    const soldPrices = soldListings
      .map((listing) => listing.price)
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);

    const fallbackPrices = soldPrices.length > 0 ? soldPrices : validPrices;

    const activeCount = activeListings.length;
    const soldCount = soldListings.length;

    const summary = {
      activeCount,
      soldCount,
      totalListings: listings.length,
      medianSoldPrice: median(fallbackPrices),
      averageSoldPrice: average(fallbackPrices),
      lowPrice: fallbackPrices.length ? Math.min(...fallbackPrices) : null,
      highPrice: fallbackPrices.length ? Math.max(...fallbackPrices) : null,
      sellThroughRatio: activeCount > 0 ? soldCount / activeCount : soldCount > 0 ? soldCount : null,
      demand:
        soldCount >= 20 && activeCount <= 10
          ? 'critical'
          : soldCount >= 10
            ? 'high'
            : soldCount >= 3
              ? 'medium'
              : 'low',
    };

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to summarize eBay listings.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
