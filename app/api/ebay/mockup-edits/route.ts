import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CANONICAL_EDITS_PATH = 'scratch/frontend-ebay-edits/current-live-edits.json';
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

function commitPath(partNumber: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `scratch/frontend-ebay-edits/${stamp}-${partNumber || 'batch'}.json`;
}

function cleanFileStem(value: unknown): string {
  return String(value || 'image')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function parseDataUrl(value: unknown) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;

  const contentBase64 = match[2].replace(/\s/g, '');
  const byteLength = Buffer.byteLength(contentBase64, 'base64');
  if (!byteLength || byteLength > MAX_IMAGE_BYTES) return null;

  return {
    mimeType,
    extension: ALLOWED_IMAGE_TYPES.get(mimeType) || '.jpg',
    contentBase64,
    byteLength,
  };
}

function jsonFile(pathName: string, value: unknown) {
  return {
    path: pathName,
    contentBase64: Buffer.from(JSON.stringify(value, null, 2), 'utf8').toString('base64'),
  };
}

async function githubJson({
  token,
  repo,
  pathName,
  init,
}: {
  token: string;
  repo: string;
  pathName: string;
  init?: RequestInit;
}) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/${pathName}`,
    {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers || {}),
      },
    },
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} for ${pathName}: ${JSON.stringify(result).slice(0, 800)}`,
    );
  }

  return result;
}

async function commitFilesToGitHub({
  token,
  repo,
  branch,
  message,
  files,
}: {
  token: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{ path: string; contentBase64: string }>;
}) {
  const ref = await githubJson({
    token,
    repo,
    pathName: `git/ref/heads/${branch}`,
  });
  const headSha = ref?.object?.sha;
  if (!headSha) throw new Error(`Could not resolve GitHub branch ${branch}.`);

  const headCommit = await githubJson({
    token,
    repo,
    pathName: `git/commits/${headSha}`,
  });
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) throw new Error(`Could not resolve GitHub tree for ${branch}.`);

  const tree = [];
  for (const file of files) {
    const blob = await githubJson({
      token,
      repo,
      pathName: 'git/blobs',
      init: {
        method: 'POST',
        body: JSON.stringify({
          content: file.contentBase64,
          encoding: 'base64',
        }),
      },
    });
    tree.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const newTree = await githubJson({
    token,
    repo,
    pathName: 'git/trees',
    init: {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree,
      }),
    },
  });

  const commit = await githubJson({
    token,
    repo,
    pathName: 'git/commits',
    init: {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [headSha],
      }),
    },
  });

  await githubJson({
    token,
    repo,
    pathName: `git/refs/heads/${branch}`,
    init: {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commit.sha,
      }),
    },
  });

  return {
    sha: commit.sha,
    htmlUrl: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const packet = await req.json();
    const editCount = Array.isArray(packet?.edits) ? packet.edits.length : 0;
    const imageInputs = Array.isArray(packet?.images) ? packet.images : [];

    if (!editCount && imageInputs.length === 0) {
      return NextResponse.json(
        { error: 'No frontend eBay edits or images were supplied.' },
        { status: 400 },
      );
    }

    const token = process.env.RRP_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
    const repo =
      process.env.RRP_EBAY_COMMIT_REPO ||
      process.env.GITHUB_REPOSITORY ||
      'vlad40000/RoadrunnerParts';
    const branch = process.env.RRP_EBAY_COMMIT_BRANCH || 'main';
    const expectedSecret = process.env.RRP_EBAY_COMMIT_SECRET || '';

    if (!token) {
      return NextResponse.json(
        {
          error: 'Commit endpoint is not configured on this deployment',
          requiredEnv: [
            'RRP_GITHUB_TOKEN',
            'RRP_EBAY_COMMIT_SECRET',
            'RRP_EBAY_COMMIT_REPO',
            'RRP_EBAY_COMMIT_BRANCH',
          ],
          fallback:
            'The frontend downloaded a commit-ready JSON packet with any selected image data.',
        },
        { status: 501 },
      );
    }

    if (!expectedSecret) {
      return NextResponse.json(
        {
          error:
            'Commit endpoint has a repo token but no RRP_EBAY_COMMIT_SECRET guard.',
        },
        { status: 500 },
      );
    }

    const suppliedSecret =
      req.headers.get('x-rrp-commit-secret') || String(packet?.secret || '');

    if (suppliedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Commit secret required.' },
        { status: 401 },
      );
    }

    const partNumber = cleanPartNumber(packet?.activePartNumber);
    const receivedAt = new Date().toISOString();
    const imageManifest = [];
    const files: Array<{ path: string; contentBase64: string }> = [];

    for (const image of imageInputs) {
      const imagePartNumber = cleanPartNumber(image?.partNumber);
      const parsed = parseDataUrl(image?.dataUrl);
      if (!imagePartNumber || !parsed) continue;

      const stamp = receivedAt.replace(/[:.]/g, '-');
      const originalStem = cleanFileStem(image?.name);
      const fileName = `${imagePartNumber}-${stamp}-${originalStem}${parsed.extension}`;
      const filePath = `scratch/approved-images/${imagePartNumber}/${fileName}`;
      files.push({
        path: filePath,
        contentBase64: parsed.contentBase64,
      });
      imageManifest.push({
        partNumber: imagePartNumber,
        originalName: String(image?.name || ''),
        mimeType: parsed.mimeType,
        byteLength: parsed.byteLength,
        filePath,
        role: 'operator_approved_sale_photo',
      });
    }

    const sanitizedPacket = {
      ...packet,
      secret: undefined,
      images: undefined,
      receivedAt,
      imageManifest,
      imageUploadCount: imageManifest.length,
    };

    const auditPath = commitPath(partNumber);
    files.push(jsonFile(CANONICAL_EDITS_PATH, sanitizedPacket));
    files.push(jsonFile(auditPath, sanitizedPacket));

    const result = await commitFilesToGitHub({
      token,
      repo,
      branch,
      message: `Save frontend eBay mockup edits ${receivedAt}`,
      files,
    });

    return NextResponse.json({
      ok: true,
      repo,
      branch,
      canonicalEditsPath: CANONICAL_EDITS_PATH,
      auditPath,
      committedFileCount: files.length,
      imageManifest,
      commitSha: result.sha,
      commitUrl: result.htmlUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to handle frontend eBay edits.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
