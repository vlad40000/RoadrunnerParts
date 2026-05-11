import { list, put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const STATE_PATH = 'ebay/mockup-state/current.json';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
]);

function cleanPartNumber(value: unknown): string {
  return String(value || '')
    .replace(/[^A-Z0-9-]/gi, '')
    .toUpperCase()
    .slice(0, 48);
}

function cleanFileStem(value: unknown): string {
  return (
    String(value || 'image')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image'
  );
}

function parseDataUrl(value: unknown) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;

  const contentBase64 = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(contentBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;

  return {
    mimeType,
    extension: ALLOWED_IMAGE_TYPES.get(mimeType) || '.jpg',
    buffer,
  };
}

async function readCurrentState() {
  const result = await list({ prefix: STATE_PATH, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === STATE_PATH);
  if (!blob) return null;

  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

export async function GET() {
  try {
    const state = await readCurrentState();
    return NextResponse.json({
      ok: true,
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load frontend eBay mockup state.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const packet = await req.json();
    const edits = Array.isArray(packet?.edits) ? packet.edits : [];
    const imageInputs = Array.isArray(packet?.images) ? packet.images : [];

    if (!edits.length && !imageInputs.length) {
      return NextResponse.json(
        { error: 'No frontend eBay edits or images were supplied.' },
        { status: 400 },
      );
    }

    const publishedAt = new Date().toISOString();
    const imageManifest = [];

    for (const image of imageInputs) {
      const partNumber = cleanPartNumber(image?.partNumber);
      const parsed = parseDataUrl(image?.dataUrl);
      if (!partNumber || !parsed) continue;

      const stamp = publishedAt.replace(/[:.]/g, '-');
      const originalStem = cleanFileStem(image?.name);
      const fileName = `${partNumber}-${stamp}-${originalStem}${parsed.extension}`;
      const pathname = `ebay/mockup-images/${partNumber}/${fileName}`;
      const blob = await put(pathname, parsed.buffer, {
        access: 'public',
        contentType: parsed.mimeType,
        allowOverwrite: true,
      });

      imageManifest.push({
        partNumber,
        originalName: String(image?.name || ''),
        mimeType: parsed.mimeType,
        byteLength: parsed.buffer.length,
        filePath: blob.pathname,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        role: 'operator_approved_sale_photo',
      });
    }

    const previous = await readCurrentState();
    const previousImages = Array.isArray(previous?.imageManifest) ? previous.imageManifest : [];
    const replacedParts = new Set(imageManifest.map((image) => image.partNumber));
    const mergedImages = [
      ...previousImages.filter((image) => !replacedParts.has(image.partNumber)),
      ...imageManifest,
    ];

    const state = {
      source: 'roadrunner-ebay-live-mockup-gallery',
      publishedAt,
      activePartNumber: cleanPartNumber(packet?.activePartNumber),
      editCount: edits.length,
      imageUploadCount: imageManifest.length,
      edits,
      imageManifest: mergedImages,
    };

    const blob = await put(STATE_PATH, JSON.stringify(state, null, 2), {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
    });

    return NextResponse.json({
      ok: true,
      stateUrl: blob.url,
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to publish frontend eBay mockup state.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
