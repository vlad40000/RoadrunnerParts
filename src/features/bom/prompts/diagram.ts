import { EXECUTION_CONTRACT } from './contract';

export const diagramPrompt = `
${EXECUTION_CONTRACT}

TASK:
Extract all visible callout numbers (Ref #) from the provided exploded-view diagrams.

OUTPUT JSON:
{
  "sections": [
    {
      "sectionName": "Name of the diagram section if visible",
      "callouts": ["list", "of", "callout", "numbers"]
    }
  ],
  "manual_review_flags": []
}
`.trim();

