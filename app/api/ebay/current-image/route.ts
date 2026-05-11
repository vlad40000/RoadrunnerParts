import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error: 'current_ebay_images_are_static',
      publicPath: '/ebay-current-images/',
    },
    { status: 410 },
  );
}
