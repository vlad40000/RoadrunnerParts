import { EXECUTION_CONTRACT } from './contract';

export const consistencyPrompt = `
${EXECUTION_CONTRACT}

TASK:
Validate if the provided parts list is consistent with the appliance identity.

OUTPUT JSON:
{
  "ok": true/false,
  "confidence": 0.0-1.0,
  "flags": ["list", "of", "inconsistency", "flags"],
  "message": "Brief summary of consistency status",
  "manual_review_flags": []
}
`.trim();

