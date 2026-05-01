import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = [
  'app/api',
  'lib',
  'src/features/bom',
];

const BLOCKED_GLOBAL_PATTERNS = [
  {
    label: 'legacy positive retail price requirement',
    pattern: /Every returned part MUST include a real positive/i,
  },
  {
    label: 'legacy exact current retail price instruction',
    pattern: /EXACT CURRENT RETAIL PRICE/i,
  },
  {
    label: 'legacy BOM pricing fallback chain',
    pattern: /Use this required pricing fallback chain/i,
  },
];

const BOM_ROUTE_BLOCKED_PATTERNS = [
  {
    label: 'BOM route calling legacy generateBOM',
    pattern: /generateBOM\s*\(/i,
  },
  {
    label: 'BOM route importing extractNameplateFromImage',
    pattern: /extractNameplateFromImage/i,
  },
];

const PRICING_ALLOWED_PATHS = [
  'src/features/bom/prompts/engine.ts',
  'src/features/bom/services/retail-pricing.ts',
  'src/features/bom/services/retail-pricing.js',
  'app/api/bom/jobs/[jobId]/price/route.ts',
];

function walkFiles(dir) {
  const absolute = path.join(ROOT, dir);

  if (!fs.existsSync(absolute)) return [];

  const out = [];

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walkFiles(path.relative(ROOT, full)));
      continue;
    }

    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).replaceAll('\\', '/'));
    }
  }

  return out;
}

function isPricingAllowedPath(file) {
  return PRICING_ALLOWED_PATHS.includes(file);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function fail(message, details = []) {
  console.error(`\n[smoke-prompt-audit] FAIL: ${message}`);

  for (const detail of details) {
    console.error(`- ${detail}`);
  }

  process.exitCode = 1;
}

const files = SCAN_DIRS.flatMap(walkFiles);
const failures = [];

for (const file of files) {
  const content = read(file);

  for (const blocked of BLOCKED_GLOBAL_PATTERNS) {
    if (!blocked.pattern.test(content)) continue;

    if (isPricingAllowedPath(file)) continue;

    failures.push(`${file}: ${blocked.label}`);
  }

  if (file.startsWith('app/api/')) {
    for (const blocked of BOM_ROUTE_BLOCKED_PATTERNS) {
      if (blocked.pattern.test(content)) {
        failures.push(`${file}: ${blocked.label}`);
      }
    }
  }
}

const bomRoute = 'app/api/bom/route.ts';
if (fs.existsSync(path.join(ROOT, bomRoute))) {
  const content = read(bomRoute);

  if (!/startApplianceSearchSession/.test(content)) {
    failures.push(`${bomRoute}: must call startApplianceSearchSession`);
  }

  if (/priceSource|retail price|modelMSRP/i.test(content)) {
    failures.push(`${bomRoute}: BOM discovery route contains pricing language`);
  }
}

const aiRoute = 'app/api/ai/route.ts';
if (fs.existsSync(path.join(ROOT, aiRoute))) {
  const content = read(aiRoute);

  if (/generateBOM\s*\(/.test(content)) {
    failures.push(`${aiRoute}: must not call gemini.generateBOM`);
  }

  if (!/startApplianceSearchSession/.test(content)) {
    failures.push(`${aiRoute}: task=bom must route to startApplianceSearchSession`);
  }
}

const ocrRoute = 'app/api/ocr/route.ts';
if (fs.existsSync(path.join(ROOT, ocrRoute))) {
  const content = read(ocrRoute);

  if (/extractNameplateFromImage/.test(content)) {
    failures.push(`${ocrRoute}: must not call extractNameplateFromImage`);
  }

  if (!/runIdentityExtractor/.test(content)) {
    failures.push(`${ocrRoute}: must call canonical runIdentityExtractor`);
  }
}

if (failures.length > 0) {
  fail('legacy prompt or route drift found', failures);
} else {
  console.log('[smoke-prompt-audit] PASS');
}
