import { runText } from '../../bom/services/model-runner';
import { audioTranscribePrompt } from '../prompts/diagnostic-prompts';

export async function runAudioTranscriber({
  audioData,
  mimeType = 'audio/wav',
}: {
  audioData: string;
  mimeType?: string;
}) {
  return runText({
    model: 'pro',
    prompt: audioTranscribePrompt,
    files: [{ mimeType, data: audioData }],
  });
}
