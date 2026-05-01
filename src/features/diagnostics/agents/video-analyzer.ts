import { runText } from '@/features/bom/services/model-runner';
import { videoAnalyzePrompt } from '../prompts/diagnostic-prompts';

export async function runVideoAnalyzer({
  videoUri,
  mimeType = 'video/mp4',
}: {
  videoUri: string;
  mimeType?: string;
}) {
  return runText({
    model: 'pro',
    prompt: videoAnalyzePrompt,
    files: [{ mimeType, uri: videoUri }],
    systemInstruction: 'Analyze appliance failure videos for mechanical or electrical symptoms.',
  });
}

