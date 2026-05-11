import fs from 'node:fs';
import path from 'node:path';
import App from '@/src/App';

export const dynamic = 'force-dynamic';

const scopePath = path.join(process.cwd(), 'scratch/current-ebay-scope.json');
const coveragePath = path.join(process.cwd(), 'scratch/current-ebay-image-coverage.json');

function loadCurrentEbayBatch() {
  try {
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    const coverage = fs.existsSync(coveragePath)
      ? JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
      : null;
    const attachedByPart = new Map(
      (coverage?.attachedParts || []).map((part) => [
        String(part.partNumber || '').toUpperCase(),
        part,
      ]),
    );

    const parts = Array.isArray(scope.parts) ? scope.parts : [];
    const items = parts.map((part) => {
      const partNumber = String(part.partNumber || '').toUpperCase();
      const attached = attachedByPart.get(partNumber);
      const imagePath = attached?.primaryImage || '';
      const imageUrl = attached?.publicPrimaryImage || '';
      return {
        partNumber,
        diagramId: String(part.diagramId || ''),
        description: String(part.description || ''),
        supersedes: String(part.supersedes || ''),
        price: typeof part.price === 'number' ? part.price : null,
        imageCount: Number(attached?.imageCount || 0),
        imageUrl,
        imagePath,
        status: imageUrl ? 'ready_now' : 'photo_pending',
      };
    });

    return {
      generatedAt: coverage?.generatedAt || scope.generatedAt || '',
      sourceCsv: scope.sourceCsv || '',
      totalParts: Number(scope.activePartCount || items.length),
      readyCount: items.filter((item) => item.status === 'ready_now').length,
      pendingCount: items.filter((item) => item.status !== 'ready_now').length,
      items,
    };
  } catch (error) {
    console.error('[home] Failed to load current eBay batch', error);
    return null;
  }
}

export default function HomePage() {
  return <App currentEbayBatch={loadCurrentEbayBatch()} />;
}
