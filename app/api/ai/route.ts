import { NextRequest, NextResponse } from 'next/server';
import * as gemini from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task, ...params } = body;

    if (!task) {
      return NextResponse.json({ error: 'Missing task parameter' }, { status: 400 });
    }

    let result;

    switch (task) {
      case 'bom':
        result = await gemini.generateBOM(params);
        break;
      case 'diagnose':
        result = await gemini.diagnoseIssue(params);
        break;
      case 'video':
        result = await gemini.analyzeVideo(params);
        break;
      case 'audio':
        result = await gemini.transcribeAudio(params);
        break;
      case 'chat':
        result = await gemini.chatField(params);
        break;
      default:
        return NextResponse.json({ error: `Unsupported task: ${task}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI API Error]', error);
    const message = error instanceof Error ? error.message : 'Unknown AI server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
