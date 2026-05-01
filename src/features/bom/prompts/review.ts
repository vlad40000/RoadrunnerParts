import { EXECUTION_CONTRACT } from './contract';

export const reviewPrompt = `
${EXECUTION_CONTRACT}

TASK:
Review extracted appliance BOM data for completeness and integrity.

OUTPUT JSON:
{
  "status": "Summary status (e.g. 'Complete', 'Partial')",
  "coverage_score": 0.0-1.0,
  "issues": ["list", "of", "found", "issues"],
  "missing_sections": ["list", "of", "missing", "expected", "sections"],
  "unmatched_callouts": ["list", "of", "unmatched", "diagram", "callouts"],
  "pass": true/false,
  "manual_review_flags": []
}
`.trim();

