import { runStructuredJson } from '../services/model-runner';
import { consistencyPrompt } from '../prompts/consistency';

export async function runConsistencyReviewer({
  identity,
  variant,
  masterParts,
}: {
  identity: any;
  variant: any;
  masterParts: any[];
}) {
  const result = await runStructuredJson<any>({
    model: 'fast',
    prompt: consistencyPrompt,
    text: JSON.stringify({
      appliance: `${identity.brand_normalized} ${variant.resolved_model} (Variant: ${variant.resolved_revision || 'None'})`,
      productType: identity.product_type || 'appliance',
      partsSummary: masterParts.slice(0, 10).map((p) => ({
        name: p.name,
        partNumber: p.partNumber,
      })),
    }),
    temperature: 0,
  });

  return {
    ok: result.ok ?? true,
    confidence: result.confidence ?? 0.5,
    flags: result.flags || [],
    message: result.message || 'Consistency review completed.',
  };
}
