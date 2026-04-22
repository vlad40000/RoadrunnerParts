import { classifyBomResult } from '../lib/parts-classifier.js';

const tests = [
  {
    name: 'No Data at all',
    params: { summary: '', rawRowCount: 0, masterRowCount: 0, sectionCount: 0 },
    expected: 'no_result'
  },
  {
    name: 'Manufacturer Summary Only (needs fallback)',
    params: { summary: 'Desc', rawRowCount: 0, masterRowCount: 0, sectionCount: 0, isManufacturerPass: true },
    expected: 'needs_fallback'
  },
  {
    name: 'Final Summary Only (fallback failed)',
    params: { summary: 'Desc', rawRowCount: 0, masterRowCount: 0, sectionCount: 0, isManufacturerPass: false },
    expected: 'summary_only'
  },
  {
    name: 'Parts Partial (flags present)',
    params: { summary: 'Desc', rawRowCount: 10, masterRowCount: 8, sectionCount: 2, paginationComplete: false, flags: ['section-fetch-failures'] },
    expected: 'parts_partial'
  },
  {
    name: 'BOM Complete',
    params: { summary: 'Desc', rawRowCount: 50, masterRowCount: 45, sectionCount: 5, paginationComplete: true },
    expected: 'bom_complete'
  }
];

let failed = 0;
tests.forEach(t => {
  const result = classifyBomResult(t.params);
  if (result !== t.expected) {
    console.error(`FAIL: ${t.name}. Expected ${t.expected}, got ${result}`);
    failed++;
  } else {
    console.log(`PASS: ${t.name}`);
  }
});

if (failed > 0) process.exit(1);
console.log('\nAll classification tests passed!');
