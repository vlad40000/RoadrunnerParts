import { fetchDiagramIndex } from '../lib/diagram-indexer.js';
import { fetchDiagramPartsWithRetry } from '../lib/diagram-fetcher.js';

async function test() {
  const model = 'WM2501HWA';
  console.log(`Testing diagram indexing for ${model}...`);
  
  const variant = { resolved_model: model, resolved_revision: null };
  const identity = { model_normalized: model };
  const route = { primary_source: 'oem_lg' };

  const indexResult = await fetchDiagramIndex({ identity, route, variant });
  
  if (!indexResult.ok || !indexResult.diagrams?.length) {
    console.error('FAILED: No diagrams found.');
    process.exit(1);
  }

  console.log(`SUCCESS: Found ${indexResult.diagrams.length} diagrams.`);
  indexResult.diagrams.forEach(d => console.log(` - ${d.label} (${d.url})`));

  console.log('\nTesting part fetch for first diagram...');
  const parts = await fetchDiagramPartsWithRetry({ diagram: indexResult.diagrams[0] });
  
  if (!parts || !parts.length) {
    console.error('FAILED: No parts found in diagram.');
    process.exit(1);
  }

  console.log(`SUCCESS: Found ${parts.length} parts in first diagram.`);
  console.log('Sample parts:');
  parts.slice(0, 3).forEach(p => console.log(` - ${p.name} (${p.partNumber})`));
}

test().catch(console.error);
