import { NextResponse } from 'next/server';

const faviconBytes = Uint8Array.from([
  0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 104, 4, 0, 0, 22, 0, 0, 0, 40,
  0, 0, 0, 16, 0, 0, 0, 32, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 0, 4, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ...Array.from({ length: 1024 }, (_, index) => {
    const pixel = Math.floor(index / 4);
    const x = pixel % 16;
    const y = Math.floor(pixel / 16);
    const channel = index % 4;
    const edge = x < 2 || x > 13 || y < 2 || y > 13;
    const blue = x >= 4 && x <= 11 && y >= 4 && y <= 11;
    if (channel === 0) return blue ? 0xf3 : edge ? 0x20 : 0xff;
    if (channel === 1) return blue ? 0x65 : edge ? 0x32 : 0xff;
    if (channel === 2) return blue ? 0x36 : edge ? 0x16 : 0xff;
    return 0xff;
  }),
  ...Array.from({ length: 64 }, () => 0),
]);

export function GET() {
  return new NextResponse(faviconBytes, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': 'image/x-icon',
    },
  });
}
