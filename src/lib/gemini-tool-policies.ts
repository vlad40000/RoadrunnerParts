import 'server-only';

export type GeminiToolName =
  | 'bom'
  | 'diagnosis'
  | 'partFinder'
  | 'partsCatalog'
  | 'ebay'
  | 'market'
  | 'identity'
  | 'calculators'
  | 'global';

export type GeminiBucketName = 'heavy' | 'lite' | 'other';

export type GeminiBucketPolicy = {
  model: string;
  maxConcurrent: number;
  maxCallsPerWindow: number;
  maxCallsPerJob?: number;
  maxCallsPerRequest?: number;
  dailyBudget?: number;
};

export type GeminiToolPolicy = {
  windowMs: number;
  maxCallsPerJob?: number;
  maxCallsPerRequest?: number;
  maxGroundedCallsPerJob?: number;
  heavy: GeminiBucketPolicy;
  lite: GeminiBucketPolicy;
  other: GeminiBucketPolicy;
  heavyGrounded?: Partial<GeminiBucketPolicy>;
  liteGrounded?: Partial<GeminiBucketPolicy>;
};

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function envModel(name: string, fallback: string) {
  return String(process.env[name] || fallback).trim();
}

const DEFAULT_WINDOW_MS = envInt('GEMINI_SCHEDULER_WINDOW_MS', 3000);
const HEAVY_MODEL = envModel('GEMINI_HEAVY_MODEL', 'gemini-3-flash-preview');
const LITE_MODEL = envModel('GEMINI_LITE_MODEL', 'gemini-3.1-flash-lite');
const OTHER_MODEL = envModel('GEMINI_OTHER_MODEL', LITE_MODEL);

const disabledBucket: GeminiBucketPolicy = {
  model: LITE_MODEL,
  maxConcurrent: 0,
  maxCallsPerWindow: 0,
};

function heavy(overrides: Partial<GeminiBucketPolicy> = {}): GeminiBucketPolicy {
  return {
    model: HEAVY_MODEL,
    maxConcurrent: 1,
    maxCallsPerWindow: 1,
    ...overrides,
  };
}

function lite(overrides: Partial<GeminiBucketPolicy> = {}): GeminiBucketPolicy {
  return {
    model: LITE_MODEL,
    maxConcurrent: 2,
    maxCallsPerWindow: 2,
    ...overrides,
  };
}

function other(overrides: Partial<GeminiBucketPolicy> = {}): GeminiBucketPolicy {
  return {
    model: OTHER_MODEL,
    maxConcurrent: 1,
    maxCallsPerWindow: 1,
    ...overrides,
  };
}

export const TOOL_MODEL_POLICIES: Record<GeminiToolName, GeminiToolPolicy> = {
  global: {
    windowMs: envInt('GEMINI_GLOBAL_WINDOW_MS', DEFAULT_WINDOW_MS),
    heavy: heavy({
      maxConcurrent: envInt('GEMINI_GLOBAL_HEAVY_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('GEMINI_GLOBAL_HEAVY_MAX_CALLS_PER_WINDOW', 1),
    }),
    lite: lite({
      maxConcurrent: envInt('GEMINI_GLOBAL_LITE_MAX_CONCURRENT', 2),
      maxCallsPerWindow: envInt('GEMINI_GLOBAL_LITE_MAX_CALLS_PER_WINDOW', 2),
    }),
    other: other({
      maxConcurrent: envInt('GEMINI_GLOBAL_OTHER_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('GEMINI_GLOBAL_OTHER_MAX_CALLS_PER_WINDOW', 1),
    }),
  },

  bom: {
    windowMs: envInt('BOM_WINDOW_MS', DEFAULT_WINDOW_MS),
    maxCallsPerJob: envInt('BOM_MAX_CALLS_PER_JOB', 12),
    maxGroundedCallsPerJob: envInt('BOM_MAX_GROUNDED_CALLS_PER_JOB', 3),
    heavy: heavy({
      model: envModel('BOM_HEAVY_MODEL', HEAVY_MODEL),
      maxConcurrent: envInt('BOM_HEAVY_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('BOM_HEAVY_MAX_CALLS_PER_WINDOW', 1),
      maxCallsPerJob: envInt('BOM_MAX_HEAVY_CALLS_PER_JOB', 2),
    }),
    lite: lite({
      model: envModel('BOM_LITE_MODEL', LITE_MODEL),
      maxConcurrent: envInt('BOM_LITE_MAX_CONCURRENT', 2),
      maxCallsPerWindow: envInt('BOM_LITE_MAX_CALLS_PER_WINDOW', 2),
      maxCallsPerJob: envInt('BOM_MAX_LITE_CALLS_PER_JOB', 10),
    }),
    other: other(),
    heavyGrounded: {
      maxConcurrent: envInt('BOM_HEAVY_GROUNDED_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('BOM_HEAVY_GROUNDED_MAX_CALLS_PER_WINDOW', 1),
      dailyBudget: envInt('BOM_HEAVY_GROUNDED_DAILY_BUDGET', 1500),
    },
    liteGrounded: {
      maxConcurrent: envInt('BOM_LITE_GROUNDED_MAX_CONCURRENT', 2),
      maxCallsPerWindow: envInt('BOM_LITE_GROUNDED_MAX_CALLS_PER_WINDOW', 2),
      dailyBudget: envInt('BOM_LITE_GROUNDED_DAILY_BUDGET', 100000),
    },
  },

  diagnosis: {
    windowMs: envInt('DIAG_WINDOW_MS', DEFAULT_WINDOW_MS),
    maxCallsPerRequest: envInt('DIAG_MAX_CALLS_PER_REQUEST', 4),
    heavy: heavy({ maxCallsPerRequest: envInt('DIAG_MAX_HEAVY_CALLS_PER_REQUEST', 1) }),
    lite: lite({
      maxCallsPerWindow: envInt('DIAG_LITE_MAX_CALLS_PER_WINDOW', 1),
      maxCallsPerRequest: envInt('DIAG_MAX_LITE_CALLS_PER_REQUEST', 3),
    }),
    other: other(),
  },

  partFinder: {
    windowMs: envInt('PARTS_WINDOW_MS', DEFAULT_WINDOW_MS),
    maxCallsPerRequest: envInt('PARTS_MAX_CALLS_PER_REQUEST', 5),
    heavy: heavy({ maxCallsPerRequest: envInt('PARTS_MAX_HEAVY_CALLS_PER_REQUEST', 1) }),
    lite: lite({ maxCallsPerRequest: envInt('PARTS_MAX_LITE_CALLS_PER_REQUEST', 4) }),
    other: other(),
  },

  partsCatalog: {
    windowMs: DEFAULT_WINDOW_MS,
    maxCallsPerRequest: envInt('CATALOG_MAX_CALLS_PER_REQUEST', 1),
    heavy: { ...disabledBucket, model: HEAVY_MODEL },
    lite: lite({ maxCallsPerRequest: envInt('CATALOG_MAX_LITE_CALLS_PER_REQUEST', 1) }),
    other: other(),
  },

  ebay: {
    windowMs: envInt('EBAY_WINDOW_MS', DEFAULT_WINDOW_MS),
    maxCallsPerRequest: envInt('EBAY_MAX_CALLS_PER_LISTING', 5),
    heavy: heavy({ maxCallsPerRequest: envInt('EBAY_MAX_HEAVY_CALLS_PER_LISTING', 1) }),
    lite: lite({ maxCallsPerRequest: envInt('EBAY_MAX_LITE_CALLS_PER_LISTING', 4) }),
    other: other(),
    liteGrounded: {
      maxConcurrent: envInt('EBAY_LITE_GROUNDED_MAX_CONCURRENT', 2),
      maxCallsPerWindow: envInt('EBAY_LITE_GROUNDED_MAX_CALLS_PER_WINDOW', 2),
    },
  },

  market: {
    windowMs: DEFAULT_WINDOW_MS,
    maxCallsPerRequest: envInt('MARKET_MAX_CALLS_PER_ITEM', 3),
    heavy: { ...disabledBucket, model: HEAVY_MODEL },
    lite: lite({ maxCallsPerRequest: envInt('MARKET_MAX_LITE_CALLS_PER_ITEM', 3) }),
    other: other(),
    liteGrounded: {
      maxConcurrent: envInt('MARKET_LITE_GROUNDED_MAX_CONCURRENT', 2),
      maxCallsPerWindow: envInt('MARKET_LITE_GROUNDED_MAX_CALLS_PER_WINDOW', 2),
    },
  },

  identity: {
    windowMs: DEFAULT_WINDOW_MS,
    maxCallsPerRequest: envInt('IDENTITY_MAX_CALLS_PER_REQUEST', 2),
    heavy: heavy({ maxCallsPerRequest: envInt('IDENTITY_MAX_HEAVY_CALLS_PER_REQUEST', 1) }),
    lite: lite({
      maxConcurrent: envInt('IDENTITY_LITE_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('IDENTITY_LITE_MAX_CALLS_PER_WINDOW', 1),
      maxCallsPerRequest: envInt('IDENTITY_MAX_LITE_CALLS_PER_REQUEST', 1),
    }),
    other: other(),
  },

  calculators: {
    windowMs: DEFAULT_WINDOW_MS,
    maxCallsPerRequest: envInt('CALCULATORS_MAX_CALLS_PER_REQUEST', 1),
    heavy: { ...disabledBucket, model: HEAVY_MODEL },
    lite: lite({
      maxConcurrent: envInt('CALCULATORS_LITE_MAX_CONCURRENT', 1),
      maxCallsPerWindow: envInt('CALCULATORS_LITE_MAX_CALLS_PER_WINDOW', 1),
      maxCallsPerRequest: envInt('CALCULATORS_MAX_LITE_CALLS_PER_REQUEST', 1),
    }),
    other: other(),
  },
};

export function isGeminiToolName(value: unknown): value is GeminiToolName {
  return typeof value === 'string' && value in TOOL_MODEL_POLICIES;
}

export function resolveGeminiBucket(model?: string): GeminiBucketName {
  const value = String(model || '').toLowerCase();
  if (value.includes('gemini-3-flash')) return 'heavy';
  if (value.includes('flash-lite')) return 'lite';
  return 'other';
}

export function getGeminiToolPolicy(tool?: string): GeminiToolPolicy {
  return isGeminiToolName(tool) ? TOOL_MODEL_POLICIES[tool] : TOOL_MODEL_POLICIES.global;
}

export function getGeminiBucketPolicy(input: {
  tool?: string;
  bucket?: GeminiBucketName;
  model?: string;
  grounded?: boolean;
}): GeminiBucketPolicy & { windowMs: number; key: string } {
  const toolName = isGeminiToolName(input.tool) ? input.tool : 'global';
  const policy = getGeminiToolPolicy(toolName);
  const bucket = input.bucket || resolveGeminiBucket(input.model);
  const base = policy[bucket] || policy.other;
  const groundedOverride = input.grounded
    ? bucket === 'heavy'
      ? policy.heavyGrounded
      : bucket === 'lite'
        ? policy.liteGrounded
        : undefined
    : undefined;

  return {
    ...base,
    ...(groundedOverride || {}),
    windowMs: policy.windowMs,
    key: `${toolName}.${bucket}${input.grounded ? '_grounded' : ''}`,
  };
}
