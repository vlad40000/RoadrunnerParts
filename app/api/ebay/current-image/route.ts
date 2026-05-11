import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const scratchRoot = path.join(process.cwd(), 'scratch');
const allowedRoots = [
  path.join(scratchRoot, 'approved-images'),
  path.join(scratchRoot, 'HTDX100ED3WW Nameplate_Diagrams_Parts_Images'),
  path.join(scratchRoot, 'image-evidence'),
];

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function resolveScratchImage(filePath: string) {
  const normalized = filePath.replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || normalized.includes('..')) return null;
  if (!normalized.startsWith('scratch/')) return null;
  return path.join(scratchRoot, normalized.slice('scratch/'.length));
}

function isAllowedPath(resolved: string) {
  return allowedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path') || '';
  const ext = path.extname(filePath).toLowerCase();
  const resolved = resolveScratchImage(filePath);

  if (!resolved || !filePath || !contentTypes[ext] || !isAllowedPath(resolved)) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (!fs.existsSync(resolved)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const body = fs.readFileSync(resolved);
  return new NextResponse(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': contentTypes[ext],
    },
  });
}
