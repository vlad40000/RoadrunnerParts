import 'server-only';

import { GoogleGenerativeAI } from '@google/generative-ai';

import { db } from '../server/db';
import { nameplateExtractions, applianceModels } from '../server/db/schema/appliance-models';
import { eq, or } from 'drizzle-orm';

const apiKey = process.env.GEMINI_API_KEY;

const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

const MODEL_MAP = {
  supervisor: DEFAULT_GEMINI_MODEL,
  reviewer: DEFAULT_GEMINI_MODEL,
  analyzer: DEFAULT_GEMINI_MODEL,
  discovery: DEFAULT_GEMINI_MODEL,
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-pro': 'gemini-3-pro',
};

const ALL_SOURCES = [
  { id: 'sears', label: 'https://www.searspartsdirect.com/' },
  { id: 'repairclinic', label: 'https://repairclinic.com/' },
  { id: 'appliancepartspros', label: 'https://www.appliancepartspros.com/' },
  { id: 'fix', label: 'https://www.fix.com/' },
];

function resolveModelName(modelOrRole) {
  return MODEL_MAP[modelOrRole] || modelOrRole || DEFAULT_GEMINI_MODEL;
}

function createClient() {
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable.');
  }

  return new GoogleGenerativeAI(apiKey);
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('JSON parse error', error, text);
    return fallback;
  }
}

/**
 * Normalizes a model number for consistent database and cache lookup.
 */
function normalizeModelKey(model: string): string {
  if (!model) return '';
  return model.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toPart(item) {
  if (!item) return { text: '' };
  if (typeof item === 'string') return { text: item };
  if (item.text || item.inlineData || item.fileData || item.functionCall || item.functionResponse) {
    return item;
  }
  return { text: String(item) };
}

function normalizeContents(contents) {
  if (typeof contents === 'string') {
    return [
      {
        role: 'user',
        parts: [{ text: contents }],
      },
    ];
  }

  if (Array.isArray(contents)) {
    // Already in full content format
    if (contents.every((item) => item && typeof item === 'object' && Array.isArray(item.parts))) {
      return contents;
    }

    // Array of parts -> wrap as one user message
    return [
      {
        role: 'user',
        parts: contents.map((item) => toPart(item)),
      },
    ];
  }

  if (contents && typeof contents === 'object') {
    if (Array.isArray(contents.parts)) {
      return [contents];
    }

    return [
      {
        role: 'user',
        parts: [toPart(contents)],
      },
    ];
  }

  return [{ role: 'user', parts: [{ text: '' }] }];
}

function getGroundingSources(response) {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .flatMap((chunk) => {
      if (!chunk.web?.uri) return [];
      return [{ title: chunk.web.title || new URL(chunk.web.uri).hostname, uri: chunk.web.uri }];
    })
    .filter((source, index, array) => array.findIndex((item) => item.uri === source.uri) === index);
}

function filterSourcesByDomain(sources, allowedDomains = []) {
  if (!Array.isArray(sources) || allowedDomains.length === 0) return [];
  return sources.filter((source) => {
    try {
      const hostname = new URL(source.uri).hostname.replace(/^www\./, '');
      return allowedDomains.includes(hostname);
    } catch {
      return false;
    }
  });
}

function buildSourceRequirements(selectedSourceIds = [], { forPricing = false } = {}) {
  const activeSources = selectedSourceIds.length > 0
    ? ALL_SOURCES.filter((source) => selectedSourceIds.includes(source.id))
    : ALL_SOURCES;

  if (forPricing) {
    return `- You MUST ONLY use the following ${activeSources.length} source${activeSources.length > 1 ? 's' : ''} for pricing and parts, prioritizing them in this exact order:\n${activeSources.map((s, i) => `  ${i + 1}. ${s.label}`).join('\n')}\n- Do NOT use any other sources outside of these under any circumstances.`;
  }

  return `- Use ONLY these source domain${activeSources.length > 1 ? 's' : ''} when identifying parts:\n${activeSources.map((s, i) => `  ${i + 1}. ${s.label}`).join('\n')}\n- Do not use any domains outside this list.`;
}

export function getConfiguredModelName(modelOrRole) {
  return resolveModelName(modelOrRole);
}

type GeminiGenerateConfig = {
  tools?: any[];
  thinkingConfig?: any;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: any;
  systemInstruction?: string;
  [key: string]: any;
};

export async function generateText({
  model,
  role,
  contents,
  config = {},
}: {
  model?: string;
  role?: string;
  contents: any;
  config?: GeminiGenerateConfig;
}) {
  const genAI = createClient();
  const modelName = resolveModelName(model || role);

  try {
    const generativeModel = genAI.getGenerativeModel({
      model: modelName,
    });

    const { tools, thinkingConfig, ...generationConfig } = config;

    const generationConfigFinal: GeminiGenerateConfig = {
      temperature: 1,
      ...generationConfig,
    };

    if (thinkingConfig) {
      generationConfigFinal.thinkingConfig = thinkingConfig;
    }

    const result = await generativeModel.generateContent({
      contents: normalizeContents(contents),
      generationConfig: generationConfigFinal,
    tools: [
      ...(tools || []),
      { codeExecution: {} }
    ],
    });

    const response = await result.response;

    return {
      text: response.text()?.trim() || '',
      response,
      model: modelName,
      sources: getGroundingSources(response),
    };
  } catch (error: any) {
    console.error(`[Gemini API Error - Text] Model: ${modelName}`, error);
    throw new Error(`Failed to generate text using ${modelName}: ${error.message}`);
  }
}

export async function generateStructuredJson({
  model,
  role,
  contents,
  schema,
  tools = [],
  temperature = 1,
  config = {},
  fallback = {},
}: {
  model?: string;
  role?: string;
  contents: any;
  schema: any;
  tools?: any[];
  temperature?: number;
  config?: GeminiGenerateConfig;
  fallback?: any;
}) {
  const { text, response, model: modelName, sources } = await generateText({
    model,
    role,
    contents,
    config: {
      temperature,
      tools,
      responseMimeType: 'application/json',
      responseSchema: schema,
      ...config,
    },
  });

  return {
    data: safeJsonParse(text || '{}', fallback),
    text,
    response,
    model: modelName,
    sources,
  };
}


function parseRootDomain(url: any) {
  try {
    const s = String(url || '').trim().toLowerCase();
    const cleanUrl = s.startsWith('http') ? s : `https://${s}`;
    const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '');
    return hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolvePartSource(
  part: { source?: string } = {},
  allowedDomains: string[] = [],
  groundedSources: Array<{ uri?: string }> = [],
) {
  const explicit = parseRootDomain(part.source);
  if (allowedDomains.includes(explicit)) return explicit;

  const groundedAllowed = filterSourcesByDomain(groundedSources, allowedDomains)
    .map((source) => parseRootDomain(source.uri))
    .filter(Boolean);

  if (allowedDomains.length === 1) return allowedDomains[0];
  if (groundedAllowed.length === 1) return groundedAllowed[0];
  if (allowedDomains.includes(explicit)) return explicit;

  return explicit;
}

type ProviderPlan = {
  manufacturerDomains?: string[];
  distributorFallbacks?: string[];
  allowedDomains?: string[];
  truthOrder?: string[];
  truthSource?: string;
  strategy?: string;
  brand?: string;
};

export async function fetchPartsList(
  modelNumber: string,
  providerPlan: ProviderPlan = {},
) {
  const responseSchema = {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Full specs of the machine.' },
      parts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Part Name' },
            partNumber: { type: 'string', description: 'Official OEM Part Number' },
            category: { type: 'string', description: 'Part Category' },
            section: { type: 'string', description: 'The provider section name' },
            substitute: { type: 'string', description: 'Substitute part number if any' },
            serialNote: { type: 'string', description: 'Applicability or serial notes' },
            quantity: { type: 'string', description: 'Quantity used per machine' },
            diagramRef: { type: 'string', description: 'Reference ID or item number on diagram' },
            providerItemId: { type: 'string', description: 'Provider internal ID' },
            source: { type: 'string', description: 'The exact source domain used for this row, preferably the manufacturer domain if available.' },
          },
          required: ['name', 'partNumber', 'category', 'section', 'source'],
        },
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            uri: { type: 'string' },
          },
        },
      },
    },
    required: ['summary', 'parts'],
  };

  const manufacturerDomains = providerPlan.manufacturerDomains || [];
  const distributorFallbacks = providerPlan.distributorFallbacks || [
    'searspartsdirect.com', 
    'repairclinic.com', 
    'appliancepartspros.com',
    'fix.com'
  ];
  const allowedDomains = providerPlan.allowedDomains || [...manufacturerDomains, ...distributorFallbacks];
  const truthOrder = providerPlan.truthOrder || allowedDomains;
  const truthLabel = providerPlan.truthSource || 'Deep Catalog Recovery';
  const singleDomainMode = allowedDomains.length === 1;
  const domainInstruction = singleDomainMode
    ? `Use ONLY ${allowedDomains[0]} for this pass.`
    : `Prioritize these authoritative domains: ${allowedDomains.join(', ')}.`;

  const prompt = `
    You are a Senior Appliance Parts Analyst tasked with recovering the COMPLETE, EXHAUSTIVE Bill of Materials (BOM) for the following model:
    MODEL: ${modelNumber}
    BRAND: ${providerPlan.brand || 'Identity from search'}

    CORE OBJECTIVE:
    - You MUST return every single part number listed in the official parts manuals or distributor databases.
    - DO NOT SUMMARIZE. DO NOT OMIT small items.
    - If there are 200 parts, you return 200 part rows.
    - If the source has multiple pages, you MUST synthesize all of them.

    DATA QUALITY:
    - Identify EXACT OEM part numbers.
    - Identify part descriptions/names precisely.
    - Capture quantities, categories, and section names.
    - ${domainInstruction}

    TRUTH HIERARCHY:
    ${truthOrder.map((domain, index) => `${index + 1}. ${domain}`).join('\n')}

    RULES:
    - NEVER invent part numbers.
    - NEVER cap results.
    - Mark NLA (No Longer Available) status accurately.
    - Preserve substitutions/replacements.
    - Return JSON only mirroring the schema provided.
  `;

  const { data, sources } = await generateStructuredJson({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    tools: [{ googleSearch: {} }],
    schema: responseSchema,
    temperature: 1,
    fallback: { summary: '', parts: [] },
  });

  const groundedAllowedSources = filterSourcesByDomain(sources, allowedDomains);

  const normalizedParts = Array.isArray(data.parts)
    ? data.parts
        .map((part) => ({
          ...part,
          source: resolvePartSource(part, allowedDomains, sources),
        }))
        .filter((part) => allowedDomains.length === 0 || allowedDomains.includes(part.source))
    : [];

  const normalizedSources = Array.isArray(data.sources) && data.sources.length > 0
    ? data.sources.filter((source) => {
        return filterSourcesByDomain([source], allowedDomains).length > 0;
      })
    : groundedAllowedSources;

  return {
    summary: data.summary || '',
    parts: normalizedParts,
    sources: normalizedSources,
    source: manufacturerDomains[0] || distributorFallbacks[0] || 'unknown',
    truthSource: providerPlan.truthSource || 'Manufacturer-first',
    sourceStrategy: providerPlan.strategy || 'manufacturer-first',
  };
}


export async function extractIdentityFromManualPdf(pdfData, fileName = 'manual.pdf') {
  const responseSchema = {
    type: 'object',
    properties: {
      documentTitle: { type: 'string', nullable: true },
      brand: { type: 'string', nullable: true },
      productType: { type: 'string', nullable: true },
      modelNumber: { type: 'string', nullable: true },
      modelCandidates: {
        type: 'array',
        items: { type: 'string' },
      },
      confidence: {
        type: 'object',
        properties: {
          brand: { type: 'number' },
          productType: { type: 'number' },
          modelNumber: { type: 'number' },
        },
      },
    },
    required: ['brand', 'productType', 'modelNumber', 'modelCandidates', 'confidence'],
  };

  const prompt = `
    Analyze this appliance Owner's Manual PDF and extract the strongest appliance identity signals.

    PRIORITY:
    1. Exact model number if explicitly stated
    2. Brand
    3. Product type
    4. Additional exact model candidates if the manual covers multiple variants

    RULES:
    - IDENTIFY ONLY. Do not extract parts or pricing.
    - Prefer exact model strings (e.g. WDT730PAHZ0) over family names (e.g. WDT Series).
    - Look at the cover, specifications, and warranty sections.
    - If the manual covers several models, list them all in modelCandidates.
    - Return JSON only mirroring the schema provided.
    - Original FileName: ${fileName}
  `;

  const { data } = await generateStructuredJson({
    model: 'gemini-3-flash-preview',
    contents: [
      { text: prompt },
      {
        inlineData: {
          data: pdfData,
          mimeType: 'application/pdf',
        },
      },
    ],
    schema: responseSchema,
    temperature: 1,
    fallback: {
      documentTitle: null,
      brand: null,
      productType: null,
      modelNumber: null,
      modelCandidates: [],
      confidence: { brand: 0, productType: 0, modelNumber: 0 },
    },
  });

  // Discovery: File the model number correctly
  if (data.modelNumber) {
    const rawModel = data.modelNumber.trim();
    const normalized = normalizeModelKey(rawModel);
    
    // 1. Log extraction telemetry (Contextual/Instance data)
    await db.insert(nameplateExtractions).values({
      modelNumber: rawModel,
      brand: data.brand,
      productType: data.productType,
      rawResult: data,
      sourceType: 'pdf'
    }).catch(err => console.error('[Discovery] PDF extraction log failed:', err));

    // 2. "Model Numbers with Model Numbers" - Seed master blueprint
    await db.insert(applianceModels).values({
      normalizedModel: normalized,
      brand: data.brand,
      applianceType: data.productType,
    }).onConflictDoNothing()
      .catch(err => console.error('[Discovery] Model seeding failed:', err));
  }

  return data;
}

export async function extractNameplateFromImage(imageData, mimeType) {
  const responseSchema = {
    type: 'object',
    properties: {
      modelNumber: { type: 'string', nullable: true },
      serialNumber: { type: 'string', nullable: true },
      brand: { type: 'string', nullable: true },
      productType: { type: 'string', nullable: true },
      engineeringCode: { type: 'string', nullable: true },
      confidence: {
        type: 'object',
        properties: {
          modelNumber: { type: 'number' },
          serialNumber: { type: 'number' },
          brand: { type: 'number' },
          productType: { type: 'number' },
        },
      },
    },
    required: ['modelNumber', 'serialNumber', 'brand', 'productType', 'confidence'],
  };

  const prompt = `System Role: Act as an expert OCR and appliance data extraction system.
Task: Extract the appliance identity from the provided nameplate image.

Step-by-Step Instructions:
1. Scan the image to identify the overall brand name and product type (e.g., Washing Machine, Refrigerator).
2. Locate the model and serial numbers by searching for specific labels, such as: MODEL NO., MODEL NUMBER, MODEL, M/N, MOD, MODELO, SERIAL NO., SERIAL NUMBER, SERIAL, S/N, SER, and SERIE.
3. Extract the exact string values based on these critical rules:
   - Preserve punctuation exactly, including all slashes, hyphens, and dots.
   - Keep Kenmore-style dots (e.g., 110.12345678) and important suffixes (e.g., Samsung /A2 or /XAA).
   - Pay extremely close attention to similar characters to avoid mix-ups (0 vs. O, 1 vs. I, 8 vs. B).
4. Format the output strictly as a JSON object mirroring the provided schema. Use null when a field is not confidently present in the image.`;

  const { data } = await generateStructuredJson({
    model: 'gemini-3-flash-preview',
    contents: [
      { text: prompt },
      {
        inlineData: {
          data: imageData,
          mimeType,
        },
      },
    ],
    schema: responseSchema,
    temperature: 1,
    fallback: { modelNumber: null, serialNumber: null, brand: null, productType: null, confidence: {} },
  });

  // Discovery: File the model number correctly
  if (data.modelNumber) {
    const rawModel = data.modelNumber.trim();
    const normalized = normalizeModelKey(rawModel);

    // 1. Log extraction telemetry (Serial Numbers are Serial Numbers)
    await db.insert(nameplateExtractions).values({
      modelNumber: rawModel,
      serialNumber: data.serialNumber,
      brand: data.brand,
      productType: data.productType,
      engineeringCode: data.engineeringCode,
      rawResult: data,
      sourceType: 'image'
    }).catch(err => console.error('[Discovery] Nameplate extraction log failed:', err));

    // 2. "Model Numbers with Model Numbers" - Seed master blueprint
    await db.insert(applianceModels).values({
      normalizedModel: normalized,
      brand: data.brand,
      applianceType: data.productType,
    }).onConflictDoNothing()
      .catch(err => console.error('[Discovery] Model seeding failed:', err));
  }

  return data;
}

/**
 * Stage 1 Universal Recovery: AI Schematic Miner
 * REMOVED: Violates deterministic rule (Gemini may not guess missing rows or invent BOMs).
 */
export async function extractSchematicBOM(modelNumber: string, brand: string) {
  throw new Error("extractSchematicBOM is deprecated. Use the deterministic python worker instead.");
}

export type HtmlExtractedPart = {
  partNumber: string;
  description: string;
  diagramRef?: string | null;
  qty?: number;
  replacementNote?: string | null;
  nlaStatus?: boolean;
};

export async function extractPartsFromHtmlPage(
  sourceText: string,
  context: { model: string; section?: string },
): Promise<HtmlExtractedPart[]> {
  const prompt = `EXECUTION CONTRACT

You are completing exactly one bounded extraction task.
You are extracting appliance BOM rows from provided source text only.

You do not search.
You do not fetch.
You do not browse.
You do not infer compatibility.
You do not invent parts.
You do not estimate prices.
You do not mark BOM complete.

MODEL:
${context.model}

SECTION:
${context.section ?? "unknown"}

SOURCE TEXT:
${sourceText.slice(0, 30000)}

Return JSON only. If no verified rows exist, return {"parts":[]}.`;

  const result = await generateStructuredJson({
    role: "analyzer",
    contents: prompt,
    temperature: 0,
    schema: {
      type: "object",
      properties: {
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              partNumber: { type: "string" },
              description: { type: "string" },
              diagramRef: { type: "string", nullable: true },
              qty: { type: "number" },
              replacementNote: { type: "string", nullable: true },
              nlaStatus: { type: "boolean" },
            },
            required: ["partNumber", "description"],
          },
        },
      },
      required: ["parts"],
    },
    fallback: { parts: [] },
  });

  const parts = Array.isArray(result.data?.parts) ? result.data.parts : [];
  return parts.filter((part: any) => part?.partNumber && part?.description);
}

/**
 * Legacy AI Generative BOM
 * REMOVED: Violates deterministic rule (Gemini may not estimate prices or invent part numbers).
 */
export async function generateBOM(args: any): Promise<{ parts: any[]; modelMSRP: null; deprecated: true; reason: string }> {
  return {
    parts: [],
    modelMSRP: null,
    deprecated: true,
    reason: "generateBOM is deprecated. Use the deterministic python worker instead.",
  };
}

export async function transcribeAudio({ audioData, mimeType }) {
  const prompt = `ACT AS A SENIOR APPLIANCE TECHNICIAN. 
  Transcribe the following technical field notes from the audio recording. 
  
  CORE OBJECTIVES:
  - Capture EXACT model numbers and serial numbers if mentioned.
  - Transcribe diagnostic observations and symptoms precisely.
  - Maintain technical terminology (e.g., "drain pump", "control board", "stator", "coupler").
  - Output ONLY the transcription text. No pleasantries.`;

  const { text } = await generateText({
    model: 'gemini-3-flash-preview',
    contents: [
      { text: prompt },
      {
        inlineData: {
          data: audioData,
          mimeType,
        },
      },
    ],
    config: {
      temperature: 1.0,
    },
  });

  return text;
}

export async function diagnoseIssue({ query, model }) {
  const prompt = `ACT AS A MASTER APPLIANCE TECHNICIAN. 
  
  DIAGNOSTIC REQUEST:
  Appliance Model: ${model}
  Symptom: ${query}
  
  Your goal is to provide a structured diagnostic report.
  - Identify the top 3 most likely failure points.
  - Provide brief step-by-step troubleshooting for each.
  - Mention specific parts that might need replacement.
  - Keep the tone professional and concise.`;

  const { text } = await generateText({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 1.0,
    },
  });

  return text;
}

export async function analyzeVideo({ videoData, mimeType, model }) {
  const prompt = `ACT AS A FORENSIC APPLIANCE ANALYST.
  
  VIDEO ANALYSIS REQUEST:
  Appliance Model: ${model || 'Unknown'}
  
  Analyze this video/audio clip for:
  1. Auditory failure patterns (grinding, humming, clicking).
  2. Visual error codes on displays.
  3. Mechanical irregularities (leaks, excessive vibration).
  
  Provide a high-level summary of your findings and the suspected component failure.`;

  const { text } = await generateText({
    model: 'gemini-3-flash-preview',
    contents: [
      { text: prompt },
      {
        inlineData: {
          data: videoData,
          mimeType,
        },
      },
    ],
    config: {
      temperature: 1.0,
    },
  });

  return text;
}

export async function chatField({ message, context, history }) {
  const historyParts = (history || []).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const contextStr = context ? `
  CONTEXT:
  Active Part: ${context.part?.description || 'None'}
  Part Number: ${context.part?.partNumber || 'None'}
  Active Model: ${context.model || 'None'}
  ` : '';

  const prompt = `You are the RoadrunnerParts Technical Assistant.
  You are helping a technician in the field.
  
  ${contextStr}
  
  Answer the following question based on your master-level knowledge of appliance repair.
  Be concise, accurate, and focus on technical details.
  
  QUESTION: ${message}`;

  const { text } = await generateText({
    model: 'gemini-3-flash-preview',
    contents: [
      ...historyParts,
      { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      temperature: 1.0,
    },
  });

  return text;
}

export { ALL_SOURCES };
