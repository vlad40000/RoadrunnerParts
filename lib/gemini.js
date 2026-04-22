import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';

const MODEL_MAP = {
  supervisor: DEFAULT_GEMINI_MODEL,
  reviewer: DEFAULT_GEMINI_MODEL,
  analyzer: DEFAULT_GEMINI_MODEL,
  discovery: DEFAULT_GEMINI_MODEL,
  designer: DEFAULT_GEMINI_MODEL,
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-pro': 'gemini-3-pro',
};

const ALL_SOURCES = [
  { id: 'sears', label: 'https://www.searspartsdirect.com/' },
  { id: 'partselect', label: 'https://partselect.com/' },
  { id: 'repairclinic', label: 'https://repairclinic.com/' },
  { id: 'reliableparts', label: 'https://www.reliableparts.com/' },
  { id: 'dlpartsco', label: 'https://dlpartsco.com/' },
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

export async function generateText({ model, role, contents, config = {} }) {
  const genAI = createClient();
  const modelName = resolveModelName(model || role);

  try {
    const generativeModel = genAI.getGenerativeModel({
      model: modelName,
    });

    const { tools, thinkingConfig, ...generationConfig } = config;

    const generationConfigFinal = {
      temperature: 0.1,
      ...generationConfig,
    };

    if (thinkingConfig) {
      generationConfigFinal.thinkingConfig = thinkingConfig;
    }

    const result = await generativeModel.generateContent({
      contents: normalizeContents(contents),
      generationConfig: generationConfigFinal,
      tools: tools || [],
    });

    const response = await result.response;

    return {
      text: response.text()?.trim() || '',
      response,
      model: modelName,
      sources: getGroundingSources(response),
    };
  } catch (error) {
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
  temperature = 0.1,
  config = {},
  fallback = {},
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

export async function generateImageAsset({
  prompt,
  model,
  role = 'designer',
  storageTarget = process.env.NODE_ENV === 'production' ? 'tmp' : 'public',
}) {
  const genAI = createClient();
  const modelName = resolveModelName(model || role);

  try {
    const generativeModel = genAI.getGenerativeModel({
      model: modelName,
    });

    const result = await generativeModel.generateContent({
      contents: normalizeContents(prompt),
    });
    const response = await result.response;

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inlineData?.imageBytes);
    const imageBytes = imagePart?.inlineData?.data || imagePart?.inlineData?.imageBytes;

    if (!imageBytes) {
      throw new Error('No image bytes were returned by the model.');
    }

    const baseDir = storageTarget === 'public'
      ? path.join(process.cwd(), 'public', 'generated-assets')
      : path.join('/tmp', 'generated-assets');

    await fs.mkdir(baseDir, { recursive: true });

    const fileName = `design_${crypto.randomUUID()}.png`;
    const filePath = path.join(baseDir, fileName);
    await fs.writeFile(filePath, Buffer.from(imageBytes, 'base64'));

    return {
      filePath,
      publicPath: storageTarget === 'public' ? `/generated-assets/${fileName}` : filePath,
      model: modelName,
    };
  } catch (error) {
    console.error(`[Gemini API Error - Image] Model: ${modelName}`, error);
    throw new Error(`Failed to generate image using ${modelName}: ${error.message}`);
  }
}

function parseRootDomain(value) {
  try {
    const url = String(value || '').trim().toLowerCase();
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const hostname = new URL(cleanUrl).hostname.replace(/^www\./, '');
    return hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolvePartSource(part = {}, allowedDomains = [], groundedSources = []) {
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

export async function fetchPartsList(modelNumber, providerPlan = {}) {
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
    'encompass.com', 
    'partselect.com',
    'appliancepartspros.com',
    'fix.com',
    'reliableparts.com',
    'partstown.com'
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
    temperature: 0.1,
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
    temperature: 0.1,
    fallback: {
      documentTitle: null,
      brand: null,
      productType: null,
      modelNumber: null,
      modelCandidates: [],
      confidence: { brand: 0, productType: 0, modelNumber: 0 },
    },
  });

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

  const prompt = `ACT AS A FORENSIC APPLIANCE TECHNICIAN. 
  Your goal is to extract the IDENTITY of this appliance from the nameplate image.
  
  LOOK FOR THESE PATTERNS:
  - MODEL NUMBER: "MODEL NO.", "MODEL NUMBER", "MODEL", "M/N", "MOD", "MODELO"
  - SERIAL NUMBER: "SERIAL NO.", "SERIAL NUMBER", "SERIAL", "S/N", "SER", "SERIE"
  - BRAND: (e.g., Samsung, LG, Whirlpool, GE, Maytag, Kenmore)
  - PRODUCT TYPE: (e.g., Dishwasher, Dryer, Washer, Refrigerator)
  - ENGINEERING/REVISION: Any secondary suffix or revision codes.

  CRITICAL INSTRUCTIONS:
  1. BE EXTREMELY PRECISE with alphanumeric characters (e.g., '0' vs 'O', '1' vs 'I', '8' vs 'B').
  2. PRESERVE ALL PUNCTUATION in the model/serial. Do NOT strip slashes (/), hyphens (-), or dots (.).
  3. FOR SAMSUNG: Suffixes like "/A2" or "/XAA" are EXTREMELY IMPORTANT. Do not lose them.
  4. FOR KENMORE: Model numbers often look like "110.12345678". Preserve the dot.
  
  Return a structured JSON object. Use null for fields you cannot find with high confidence.`;

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
    temperature: 0.1,
    fallback: { modelNumber: null, serialNumber: null, brand: null, productType: null, confidence: {} },
  });

  return data;
}

/**
 * Stage 1 Universal Recovery: AI Schematic Miner
 * Specifically targets Sears/Encompass/PartSelect diagrams via Google Search grounding.
 * Bypasses 403 blocks by leveraging Google's crawler index.
 */
export async function extractSchematicBOM(modelNumber, brand) {
  const responseSchema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      parts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            partNumber: { type: 'string' },
            category: { type: 'string' },
            section: { type: 'string' },
            diagramRef: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['name', 'partNumber', 'section', 'source'],
        },
      },
    },
    required: ['parts'],
  };

  const prompt = `
    URGENT RECOVERY: Primary catalog retrieval failed for MODEL: ${modelNumber} (BRAND: ${brand}).
    Your objective is to perform a DEEP, EXHAUSTIVE SCHEMATIC MINING pass.
    
    CRITICAL MANDATE:
    - Many models (like Kenmore/Whirlpool) have 100-150 parts. You MUST return EVERY single part.
    - DO NOT SUMMARIZE. DO NOT STOP at 50 or 60 parts.
    - If you see a count like "103 parts" in the source, you MUST keep extracting until your JSON list matches that count.
    
    INSTRUCTIONS:
    1. Search Google specifically for "Sears PartsDirect ${modelNumber} diagrams", "Encompass ${modelNumber} parts list", or "PartSelect ${modelNumber} diagrams".
    2. Deeply analyze the exploded-view diagram sections (e.g., "Tub and Motor", "Control Panel", "Door Parts").
    3. Extract the OEM Part Number, Description, and Link for every item.
    4. Synthesize all found parts into one massive JSON array.
    
    TARGET DOMAINS (Prioritize these):
    - searspartsdirect.com
    - encompass.com
    - partselect.com
    - appliancepartspros.com
  `;

  const { data, sources } = await generateStructuredJson({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    tools: [{ googleSearch: {} }],
    schema: responseSchema,
    temperature: 0.1,
    fallback: { parts: [] },
  });

  return {
    summary: data.summary || `Deep Schematic Retrieval for ${modelNumber}`,
    parts: (data.parts || []).map(p => ({
      ...p,
      source: resolvePartSource(p, ['searspartsdirect.com', 'encompass.com', 'partselect.com'], sources),
    })),
    sources: sources,
    truthSource: 'Deep Schematic Mining (Search Grounded)',
    sourceStrategy: 'ai-schematic-miner',
  };
}

/**
 * Extract structured parts from a raw HTML blob.
 * Useful for recovery when structured scrapers fail.
 */
export async function extractPartsFromHtmlPage(html, { model, section }) {
  const responseSchema = {
    type: 'object',
    properties: {
      parts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            partNumber: { type: 'string' },
            description: { type: 'string' },
            diagramRef: { type: 'string', nullable: true },
            qty: { type: 'number', nullable: true },
            nlaStatus: { type: 'boolean' },
            replacementNote: { type: 'string', nullable: true },
          },
          required: ['partNumber', 'description', 'nlaStatus'],
        },
      },
    },
    required: ['parts'],
  };

  const prompt = `
    Extract a structured BOM (Bill of Materials) from this raw HTML page for model ${model}, section "${section}".
    
    RULES:
    - Identify EXACT OEM part numbers.
    - Identify part descriptions/names.
    - Look for diagram references (key numbers like #10, #22).
    - Note if a part is NLA (No Longer Available/Discontinued).
    - Capture any manufacturer substitution/replacement notes.
    - Return a JSON array of parts found.
    - DO NOT hallucinate. Only extract what is clearly visible in the text.
    
    HTML CONTENT:
    ${html.slice(0, 30000)}
  `;

  const { data } = await generateStructuredJson({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    schema: responseSchema,
    temperature: 0,
    fallback: { parts: [] },
  });

  return data.parts || [];
}

export { ALL_SOURCES };
