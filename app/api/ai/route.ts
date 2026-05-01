import { NextRequest, NextResponse } from 'next/server';
import { runDiagnoseAgent } from '@/features/diagnostics/agents/diagnose';
import { runVideoAnalyzer } from '@/features/diagnostics/agents/video-analyzer';
import { runAudioTranscriber } from '@/features/diagnostics/agents/audio-transcriber';
import { runChatAssistant } from '@/features/diagnostics/agents/chat-assistant';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task, ...params } = body;

    if (!task) {
      return NextResponse.json(
        { error: 'Missing task parameter' },
        { status: 400 },
      );
    }

    let result;

    switch (task) {
      case 'bom': {
        const modelNumber = String(
          params.modelNumber || params.model || params.query || '',
        ).trim();

        if (!modelNumber) {
          return NextResponse.json(
            { error: 'Missing modelNumber/model/query for BOM task' },
            { status: 400 },
          );
        }

        const { orchestrateBomRetrieval } = await import('@/features/bom/services/bom-orchestrator');
        result = await orchestrateBomRetrieval({
          model: modelNumber,
          serial: params.serialNumber || params.serial || '',
          brand: params.brand || null,
        });
        break;
      }

      case 'diagnose': {
        result = await runDiagnoseAgent({
          query: params.query || params.message || '',
          modelNumber: params.modelNumber || params.model || '',
        });
        break;
      }

      case 'video': {
        result = await runVideoAnalyzer({
          videoUri: params.videoUri || params.uri || '',
          mimeType: params.mimeType || 'video/mp4',
        });
        break;
      }

      case 'audio': {
        result = await runAudioTranscriber({
          audioData: params.audioData || params.data || '',
          mimeType: params.mimeType || 'audio/wav',
        });
        break;
      }

      case 'chat': {
        result = await runChatAssistant({
          message: params.message || params.query || '',
          context: params.context || {},
        });
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unsupported task: ${task}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('AI Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 },
    );
  }
}

