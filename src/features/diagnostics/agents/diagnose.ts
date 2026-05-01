import { runText } from '../../bom/services/model-runner';
import { diagnosePrompt } from '../prompts/diagnostic-prompts';

export async function runDiagnoseAgent({
  query,
  modelNumber,
}: {
  query: string;
  modelNumber?: string;
}) {
  return runText({
    model: 'pro',
    prompt: diagnosePrompt,
    text: `Diagnostic Query: ${query}${modelNumber ? `\nModel: ${modelNumber}` : ''}`,
    systemInstruction: 'You are a world-class Master Appliance Engineer. Provide troubleshooting steps and likely faulty parts.',
    temperature: 0.1,
  });
}
