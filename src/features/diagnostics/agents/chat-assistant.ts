import { runText } from '@/features/bom/services/model-runner';
import { chatAssistantPrompt } from '../prompts/diagnostic-prompts';

export async function runChatAssistant({
  message,
  context,
}: {
  message: string;
  context?: any;
}) {
  return runText({
    model: 'pro',
    prompt: chatAssistantPrompt,
    text: `User Message: ${message}\nContext: ${JSON.stringify(context || {})}`,
  });
}

