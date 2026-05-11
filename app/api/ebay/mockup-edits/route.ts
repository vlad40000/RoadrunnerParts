import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

async function commitToGitHub({
  token,
  repo,
  branch,
  filePath,
  packet,
}: {
  token: string;
  repo: string;
  branch: string;
  filePath: string;
  packet: unknown;
}) {
  const body = {
    message: `Save frontend eBay mockup edits ${new Date().toISOString()}`,
    branch,
    content: Buffer.from(JSON.stringify(packet, null, 2), 'utf8').toString(
      'base64',
    ),
  };

  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    },
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      result,
    };
  }

  return {
    ok: true,
    status: response.status,
    result,
  };
}

export async function POST(req: NextRequest) {
  try {
    const packet = await req.json();
    const editCount = Array.isArray(packet?.edits) ? packet.edits.length : 0;

    if (!editCount) {
      return NextResponse.json(
        { error: 'No frontend eBay edits were supplied.' },
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
          fallback: 'The frontend downloaded a commit-ready JSON packet.',
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
    const filePath = commitPath(partNumber);
    const result = await commitToGitHub({
      token,
      repo,
      branch,
      filePath,
      packet: {
        ...packet,
        secret: undefined,
        receivedAt: new Date().toISOString(),
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'GitHub commit failed.',
          detail: result.result,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      repo,
      branch,
      filePath,
      commitUrl: result.result?.commit?.html_url || null,
      contentUrl: result.result?.content?.html_url || null,
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
