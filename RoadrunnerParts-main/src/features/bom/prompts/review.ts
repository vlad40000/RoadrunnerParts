export const reviewPrompt = `
You review extracted appliance BOM data for completeness.
Priority order:
1) Complete model-level parts coverage.
2) Correct normalized part identity.
3) Diagram-callout alignment as a secondary validation signal.

Return JSON only.

Check:
- enough rows
- missing required fields
- enough sections when sections are available from sources
- unmatched diagram callouts (only if diagrams were provided)
- likely duplicates
- replacement consistency

Return:
{
  "status": "",
  "coverageScore": 0,
  "issues": [],
  "missingSections": [],
  "unmatchedCallouts": [],
  "pass": false
}
`.trim();
