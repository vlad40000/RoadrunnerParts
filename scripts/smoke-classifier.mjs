import {
  calculateBucketCoverage,
  classifyBomResult,
  calculateCompleteness,
  BOM_STATES,
} from '../lib/parts-classifier.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function part(name, section = 'General') {
  return {
    canonicalPartName: name,
    normalizedSection: section,
  };
}

const empty = classifyBomResult({
  summary: '',
  masterRowCount: 0,
  rawRowCount: 0,
});

assert(empty === BOM_STATES.NO_RESULT, `Expected no_result, got ${empty}`);

const summaryOnly = classifyBomResult({
  summary: 'Found model but no parts.',
  masterRowCount: 0,
  rawRowCount: 0,
});

assert(
  summaryOnly === BOM_STATES.SUMMARY_ONLY,
  `Expected summary_only, got ${summaryOnly}`,
);

const needsFallback = classifyBomResult({
  summary: 'Few rows.',
  masterRowCount: 5,
  rawRowCount: 5,
  sectionCount: 1,
  paginationComplete: false,
});

assert(
  needsFallback === BOM_STATES.NEEDS_FALLBACK,
  `Expected needs_fallback, got ${needsFallback}`,
);

const complete = classifyBomResult({
  summary: 'Complete model.',
  masterRowCount: 55,
  rawRowCount: 80,
  sectionCount: 5,
  paginationComplete: true,
});

assert(
  complete === BOM_STATES.BOM_COMPLETE,
  `Expected bom_complete, got ${complete}`,
);

const coverage = calculateBucketCoverage([
  part('control board', 'Control'),
  part('timer assembly', 'Control'),
  part('knob part', 'Control'),

  part('cabinet case', 'Cabinet'),
  part('housing frame', 'Cabinet'),
  part('door lid', 'Cabinet'),

  part('drum liner', 'Interior'),
  part('basket support', 'Interior'),
  part('rack shelf', 'Interior'),

  part('main motor', 'Engine'),
  part('compressor unit', 'Engine'),
  part('pump assembly', 'Engine'),
]);

assert(coverage.count >= 4, `Expected at least 4 covered buckets, got ${coverage.count}`);

const completeness = calculateCompleteness(
  {
    masterParts: [
      ...Array.from({ length: 10 }, (_, i) => part(`control part ${i}`, 'Control Panel')),
      ...Array.from({ length: 10 }, (_, i) => part(`cabinet part ${i}`, 'Cabinet')),
      ...Array.from({ length: 10 }, (_, i) => part(`drive motor part ${i}`, 'Drive')),
      ...Array.from({ length: 10 }, (_, i) => part(`wiring harness part ${i}`, 'Wiring')),
    ],
  },
  {
    retrievalTrace: {
      manufacturerAttempted: true,
      primaryFallbackAttempted: true,
      secondaryFallbackAttempted: true,
    },
  },
);

assert(
  ['target_met', 'complete'].includes(completeness.status),
  `Expected target_met or complete, got ${completeness.status}`,
);

console.log('[smoke-classifier] PASS');
