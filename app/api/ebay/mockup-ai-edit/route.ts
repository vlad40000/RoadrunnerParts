import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_GEMINI_TEXT_MODEL,
  isGeminiImageGenerationModel,
  normalizeGeminiModelId,
  runStructuredJson,
  runText,
} from '../../../../src/features/bom/services/model-runner';

export const runtime = 'nodejs';

type AiListingEdit = {
  title?: string;
  displayPartNumber?: string;
  fitmentLinkText?: string;
  reviewLinkText?: string;
  price?: number;
  quantity?: number;
  condition?: string;
  descriptionText?: string;
  sellerNotes?: string;
  brand?: string;
  mpn?: string;
  fitment?: string;
  location?: string;
  shipping?: string;
  returns?: string;
  rationale?: string;
  warnings?: string[];
};

type AiRequestOptions = {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  prompt?: string;
  promptPrefix?: string;
  promptSuffix?: string;
  schema?: unknown;
};

function cleanText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanGeminiModel(value: unknown): `gemini-${string}` {
  const model = normalizeGeminiModelId(cleanText(value, 120));
  return (isGeminiImageGenerationModel(model) ? DEFAULT_GEMINI_TEXT_MODEL : model) as `gemini-${string}`;
}

function cleanRequestOptions(value: unknown): AiRequestOptions {
  const record = asRecord(value);
  const options: AiRequestOptions = {
    temperature: cleanNumber(record.temperature, 1, 0, 2),
    topP: cleanNumber(record.topP, 0.8, 0, 1),
    maxOutputTokens: Math.round(cleanNumber(record.maxOutputTokens, 1800, 256, 65536)),
  };

  const systemInstruction = cleanText(record.systemInstruction, 3000);
  if (systemInstruction) options.systemInstruction = systemInstruction;

  const prompt = cleanText(record.prompt, 6000);
  if (prompt) options.prompt = prompt;

  const promptPrefix = cleanText(record.promptPrefix, 3000);
  if (promptPrefix) options.promptPrefix = promptPrefix;

  const promptSuffix = cleanText(record.promptSuffix, 3000);
  if (promptSuffix) options.promptSuffix = promptSuffix;

  if (record.schema && typeof record.schema === 'object') {
    options.schema = record.schema;
  }

  return options;
}

function sanitizeEdit(value: AiListingEdit): AiListingEdit {
  const edit: AiListingEdit = {};
  const stringFields: Array<keyof AiListingEdit> = [
    'title',
    'displayPartNumber',
    'fitmentLinkText',
    'reviewLinkText',
    'condition',
    'descriptionText',
    'sellerNotes',
    'brand',
    'mpn',
    'fitment',
    'location',
    'shipping',
    'returns',
    'rationale',
  ];

  for (const field of stringFields) {
    const text = cleanText(value[field], field === 'descriptionText' ? 1800 : 320);
    if (text) (edit as Record<string, unknown>)[field] = text;
  }

  if (Number.isFinite(Number(value.price))) edit.price = Number(value.price);
  if (Number.isFinite(Number(value.quantity))) edit.quantity = Math.max(1, Number(value.quantity));
  if (Array.isArray(value.warnings)) {
    edit.warnings = value.warnings.map((warning) => cleanText(warning, 240)).filter(Boolean);
  }

  return edit;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instruction = cleanText(body?.instruction, 1200);
    const listing = body?.listing && typeof body.listing === 'object' ? body.listing : null;
    const partNumber = cleanText(listing?.partNumber, 64).toUpperCase();
    const model = cleanGeminiModel(body?.model);
    const mode = cleanText(body?.mode, 20) === 'chat' ? 'chat' : 'edit';
    const apiOptions = cleanRequestOptions(body?.apiOptions);

    if (!instruction || !listing || !partNumber) {
      return NextResponse.json(
        { error: 'Instruction, listing, and partNumber are required.' },
        { status: 400 },
      );
    }

    if (mode === 'chat') {
      const chatSystemInstruction = [
        'You are a RoadrunnerParts office editor assistant embedded in an eBay listing editor.',
        'Answer operator questions about the current listing, visible editor state, likely save/edit failures, and what a control does.',
        'Do not claim you can see the operator screen directly. If answering about UI, use the provided editor context and say when it is inferred from the editor code/state.',
        'Do not make source-evidence or final eBay-ready claims. Keep answers concise and actionable.',
      ].join('\n');
      const chatPrompt = [
        apiOptions.promptPrefix,
        `Operator question: ${instruction}`,
        '',
        'Current listing JSON:',
        JSON.stringify(listing),
        '',
        'Editor UI context:',
        '- In edit mode, the title field and price field use dashed underline styling to show editable fields.',
        '- The price field shows a dashed underline below the numeric amount input.',
        '- The AI command panel can apply structured edits, but normal questions should be answered as chat feedback.',
        '- Save errors are shown below the Save Changes button and are separate from quality/readiness scoring.',
        '',
        'Answer in plain text. If the operator asks whether a visual element exists, answer from the UI context and mention that it is inferred from the editor code/state.',
        apiOptions.promptSuffix,
      ].filter(Boolean).join('\n');

      const message = await runText({
        model,
        temperature: apiOptions.temperature,
        topP: apiOptions.topP,
        maxOutputTokens: Math.min(apiOptions.maxOutputTokens || 900, 1200),
        systemInstruction: apiOptions.systemInstruction || chatSystemInstruction,
        prompt: apiOptions.prompt || chatPrompt,
      });

      return NextResponse.json({
        ok: true,
        mode: 'chat',
        model,
        partNumber,
        message: cleanText(message, 1600),
      });
    }

    const defaultSystemInstruction =
      'You are a RoadrunnerParts office editor assistant for eBay listing mockups. Return JSON only. You edit operator-supplied frontend fields; you do not create source evidence or final eBay posting truth.';
    const systemInstruction = [
      apiOptions.systemInstruction || defaultSystemInstruction,
      'Gemini-only office editor boundary: output is a draft field patch for operator review, not source evidence.',
    ].join('\n\n');
    const defaultPrompt = [
      apiOptions.promptPrefix,
      'Apply the operator instruction to this single eBay listing mockup.',
      '',
      'Hard rules:',
      '- Return only a JSON object with changed fields.',
      '- Do not change the partNumber.',
      '- Do not invent compatibility, test results, condition claims, or included hardware.',
      '- Do not claim new, OEM, genuine, tested, or guaranteed unless already present in the listing input.',
      '- Do not generate or suggest scraped images. If the request concerns images, use sellerNotes or warnings only.',
      '- Preserve the eBay-like wording style and keep descriptions customer-facing.',
      '- If a price change was not explicitly requested, omit price.',
      '',
      `Operator instruction: ${instruction}`,
      '',
      `Current listing JSON: ${JSON.stringify(listing)}`,
      '',
      'Allowed JSON fields: title, displayPartNumber, fitmentLinkText, reviewLinkText, price, quantity, condition, descriptionText, sellerNotes, brand, mpn, fitment, location, shipping, returns, rationale, warnings.',
      apiOptions.promptSuffix,
    ].filter(Boolean).join('\n');
    const prompt = apiOptions.prompt || defaultPrompt;

    const result = await runStructuredJson<AiListingEdit>({
      model,
      temperature: apiOptions.temperature,
      topP: apiOptions.topP,
      maxOutputTokens: apiOptions.maxOutputTokens,
      systemInstruction,
      prompt,
      schema: apiOptions.schema,
    });

    return NextResponse.json({
      ok: true,
      model,
      apiOptions: {
        temperature: apiOptions.temperature,
        topP: apiOptions.topP,
        maxOutputTokens: apiOptions.maxOutputTokens,
        customSystemInstruction: Boolean(apiOptions.systemInstruction),
        customPrompt: Boolean(apiOptions.prompt),
        customSchema: Boolean(apiOptions.schema),
      },
      partNumber,
      edit: sanitizeEdit(result),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to generate AI listing edit.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
