import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'lib/parts-service.js');

if (!fs.existsSync(file)) {
  console.error('[smoke-cache-policy] FAIL: lib/parts-service.js not found');
  process.exit(1);
}

const content = fs.readFileSync(file, 'utf8');

const requiredPatterns = [
  {
    label: 'must use findCompleteCachedBom',
    pattern: /findCompleteCachedBom/,
  },
  {
    label: 'must use upsertModelToStore',
    pattern: /upsertModelToStore/,
  },
  {
    label: 'must gate cache on target_met/complete/bom_complete',
    pattern: /\[\s*['"]target_met['"]\s*,\s*['"]complete['"]\s*,\s*['"]bom_complete['"]\s*\]\.includes/,
  },
  {
    label: 'must require reconciled.masterParts.length > 0 before caching',
    pattern: /reconciled\.masterParts\.length\s*>\s*0/,
  },
];

const failures = requiredPatterns
  .filter((item) => !item.pattern.test(content))
  .map((item) => item.label);

if (failures.length > 0) {
  console.error('[smoke-cache-policy] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[smoke-cache-policy] PASS');
