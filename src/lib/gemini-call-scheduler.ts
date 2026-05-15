import 'server-only';

import {
  getGeminiBucketPolicy,
  type GeminiBucketName,
  type GeminiToolName,
} from './gemini-tool-policies';

type ScheduledGeminiCall<T> = {
  tool?: GeminiToolName | string;
  bucket?: GeminiBucketName;
  model?: string;
  grounded?: boolean;
  route?: string;
  jobId?: string;
  requestId?: string;
  run: () => Promise<T>;
};

type BucketState = {
  active: number;
  starts: number[];
};

type GeminiUsageLike = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
};

const bucketStates = new Map<string, BucketState>();

function enabled() {
  return String(process.env.GEMINI_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getState(key: string): BucketState {
  const existing = bucketStates.get(key);
  if (existing) return existing;
  const created = { active: 0, starts: [] };
  bucketStates.set(key, created);
  return created;
}

function pruneStarts(state: BucketState, windowMs: number, now = Date.now()) {
  state.starts = state.starts.filter((startedAt) => now - startedAt < windowMs);
}

function delayUntilAvailable(state: BucketState, policy: ReturnType<typeof getGeminiBucketPolicy>) {
  const now = Date.now();
  pruneStarts(state, policy.windowMs, now);

  if (policy.maxConcurrent <= 0 || policy.maxCallsPerWindow <= 0) {
    throw new Error(`[Gemini Scheduler] Bucket disabled: ${policy.key}`);
  }

  if (state.active >= policy.maxConcurrent) {
    return 50;
  }

  if (state.starts.length >= policy.maxCallsPerWindow) {
    const oldest = Math.min(...state.starts);
    return Math.max(25, policy.windowMs - (now - oldest) + 5);
  }

  return 0;
}

function extractUsageMetadata(result: any): GeminiUsageLike | null {
  if (!result || typeof result !== 'object') return null;
  if (result.usageMetadata) return result.usageMetadata as GeminiUsageLike;
  if (result.response?.usageMetadata) return result.response.usageMetadata as GeminiUsageLike;
  return null;
}

function logGeminiCall(input: {
  status: 'ok' | 'error';
  policyKey: string;
  model?: string;
  route?: string;
  jobId?: string;
  requestId?: string;
  durationMs: number;
  usage?: GeminiUsageLike | null;
  error?: unknown;
}) {
  const payload = {
    event: 'gemini_call',
    status: input.status,
    bucket: input.policyKey,
    model: input.model,
    route: input.route,
    jobId: input.jobId,
    requestId: input.requestId,
    durationMs: input.durationMs,
    promptTokens: input.usage?.promptTokenCount ?? input.usage?.prompt_tokens ?? null,
    outputTokens: input.usage?.candidatesTokenCount ?? input.usage?.completion_tokens ?? null,
    totalTokens: input.usage?.totalTokenCount ?? input.usage?.total_tokens ?? null,
    thoughtTokens: input.usage?.thoughtsTokenCount ?? null,
    toolUseTokens: input.usage?.toolUsePromptTokenCount ?? null,
    error: input.error instanceof Error ? input.error.message : input.error ? String(input.error) : undefined,
  };

  if (input.status === 'error') {
    console.error('[Gemini Scheduler]', JSON.stringify(payload));
  } else if (String(process.env.GEMINI_SCHEDULER_LOG_SUCCESS ?? 'true').toLowerCase() !== 'false') {
    console.log('[Gemini Scheduler]', JSON.stringify(payload));
  }
}

export async function scheduleGeminiCall<T>(input: ScheduledGeminiCall<T>): Promise<T> {
  const policy = getGeminiBucketPolicy({
    tool: input.tool,
    bucket: input.bucket,
    model: input.model,
    grounded: input.grounded,
  });

  if (!enabled()) {
    return input.run();
  }

  const state = getState(policy.key);
  while (true) {
    const delay = delayUntilAvailable(state, policy);
    if (delay === 0) break;
    await sleep(delay);
  }

  state.active += 1;
  state.starts.push(Date.now());
  const startedAt = Date.now();

  try {
    const result = await input.run();
    logGeminiCall({
      status: 'ok',
      policyKey: policy.key,
      model: input.model || policy.model,
      route: input.route,
      jobId: input.jobId,
      requestId: input.requestId,
      durationMs: Date.now() - startedAt,
      usage: extractUsageMetadata(result),
    });
    return result;
  } catch (error) {
    logGeminiCall({
      status: 'error',
      policyKey: policy.key,
      model: input.model || policy.model,
      route: input.route,
      jobId: input.jobId,
      requestId: input.requestId,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  } finally {
    state.active = Math.max(0, state.active - 1);
  }
}

export function getScheduledModel(input: {
  tool?: GeminiToolName | string;
  bucket?: GeminiBucketName;
  model?: string;
  grounded?: boolean;
}) {
  const policy = getGeminiBucketPolicy(input);
  return input.model || policy.model;
}
