// @ts-ignore
import pdf from 'pdf-parse';

export type PreparedManualContext = {
  markdown: string;
  pageCount: number;
  selectedPages: number[];
  extractionMethod: "text";
  fallbackRecommended: boolean;
};

type PageCandidate = {
  pageNumber: number;
  rawText: string;
  normalizedText: string;
  score: number;
};

const BRAND_HINTS = [
  "Amana",
  "Bosch",
  "Electrolux",
  "Frigidaire",
  "GE",
  "Hisense",
  "Hotpoint",
  "Kenmore",
  "LG",
  "Maytag",
  "Samsung",
  "Whirlpool",
];

const IDENTITY_PATTERNS = [
  /\bmodel\b/i,
  /\bmodel number\b/i,
  /\bmodel no\.?\b/i,
  /\bm\/n\b/i,
  /\bserial\b/i,
  /\bserial number\b/i,
  /\bs\/n\b/i,
  /\bproduct\b/i,
  /\btype\b/i,
  /\bspecifications?\b/i,
  /\bdata sheet\b/i,
  /\btech(nical)? sheet\b/i,
  /\bwarranty\b/i,
];

const MODELISH_PATTERN = /\b[A-Z0-9][A-Z0-9\-]{5,}\b/g;

export async function prepareManualIdentityContext(input: {
  uri: string;
  fileName?: string;
  maxPages?: number;
  maxChars?: number;
}): Promise<PreparedManualContext> {
  const buffer = await fetchPdfBuffer(input.uri);
  return prepareManualIdentityContextFromBuffer({
    buffer,
    fileName: input.fileName,
    maxPages: input.maxPages,
    maxChars: input.maxChars,
  });
}

export async function prepareManualIdentityContextFromBuffer(input: {
  buffer: Buffer;
  fileName?: string;
  maxPages?: number;
  maxChars?: number;
}): Promise<PreparedManualContext> {
  const maxPages = Math.max(1, input.maxPages ?? 6);
  const maxChars = Math.max(1000, input.maxChars ?? 12000);

  const pageTexts = await extractPdfPages(input.buffer);

  const normalizedPages = pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    rawText: text,
    normalizedText: normalizeManualPageText(text),
  }));

  const strippedPages = stripRepeatedHeaderFooterNoise(normalizedPages);

  const candidates: PageCandidate[] = strippedPages.map((page) => ({
    pageNumber: page.pageNumber,
    rawText: page.rawText,
    normalizedText: page.normalizedText,
    score: scoreIdentityPage(page.normalizedText),
  }));

  const selectedPageNumbers = selectRelevantPages(candidates, maxPages);

  const selectedPages = candidates
    .filter((page) => selectedPageNumbers.includes(page.pageNumber))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const markdown = clampMarkdown(
    buildManualMarkdown({
      fileName: input.fileName,
      pages: selectedPages,
    }),
    maxChars,
  );

  const usefulCharCount = selectedPages.reduce(
    (sum, page) => sum + page.normalizedText.length,
    0,
  );

  const modelishHits = selectedPages.reduce((sum, page) => {
    const matches = page.normalizedText.match(MODELISH_PATTERN);
    return sum + (matches?.length ?? 0);
  }, 0);

  return {
    markdown,
    pageCount: pageTexts.length,
    selectedPages: selectedPages.map((page) => page.pageNumber),
    extractionMethod: "text",
    fallbackRecommended:
      markdown.length < 500 || usefulCharCount < 500 || modelishHits === 0,
  };
}

async function fetchPdfBuffer(uri: string): Promise<Buffer> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Failed to fetch manual PDF: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];

  const options = {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items
        .map((item: any) => (item.str || ""))
        .join(" ");
      pages.push(text);
      return text;
    },
  };

  await pdf(buffer, options);

  // Note: pdf-parse calls pagerender for each page in order.
  return pages;
}

function normalizeManualPageText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[•·●▪■]/g, "-")
    .replace(/[_=]{3,}/g, " ")
    .replace(/[-]{4,}/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.length <= 1) return false;
      if (/^page \d+$/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function stripRepeatedHeaderFooterNoise(
  pages: Array<{ pageNumber: number; rawText: string; normalizedText: string }>,
) {
  const lineFrequency = new Map<string, number>();

  for (const page of pages) {
    const lines = page.normalizedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const sample = [...lines.slice(0, 3), ...lines.slice(-3)];
    for (const line of sample) {
      if (line.length < 4) continue;
      lineFrequency.set(line, (lineFrequency.get(line) ?? 0) + 1);
    }
  }

  return pages.map((page) => {
    const cleaned = page.normalizedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const repeats = lineFrequency.get(line) ?? 0;
        if (repeats < 3) return true;
        if (/\bmodel\b|\bserial\b/i.test(line)) return true;
        if (/\b[A-Z0-9][A-Z0-9\-]{5,}\b/.test(line)) return true;
        return false;
      })
      .join("\n")
      .trim();

    return {
      ...page,
      normalizedText: cleaned,
    };
  });
}

function scoreIdentityPage(text: string): number {
  if (!text) return -100;

  let score = 0;
  const compact = text.toLowerCase();

  for (const pattern of IDENTITY_PATTERNS) {
    if (pattern.test(text)) score += 8;
  }

  for (const brand of BRAND_HINTS) {
    if (compact.includes(brand.toLowerCase())) score += 6;
  }

  const modelishMatches = text.match(MODELISH_PATTERN) ?? [];
  score += Math.min(modelishMatches.length, 8) * 5;

  if (/model.*serial|serial.*model/i.test(text)) score += 12;
  if (/model number|serial number|m\/n|s\/n/i.test(text)) score += 12;
  if (/warranty|specifications?|product data|technical data/i.test(text)) score += 6;
  if (/safety instructions|important safety|warning|caution/i.test(text)) score -= 10;
  if (text.length < 120) score -= 8;
  if (!/[A-Z]/.test(text) || !/\d/.test(text)) score -= 6;

  return score;
}

function selectRelevantPages(
  pages: PageCandidate[],
  maxPages: number,
): number[] {
  const selected = new Set<number>();

  if (pages.length >= 1) selected.add(1);
  if (pages.length >= 2) selected.add(2);

  const ranked = [...pages]
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
    .filter((page) => page.normalizedText.length > 0);

  for (const page of ranked) {
    if (selected.size >= maxPages) break;
    selected.add(page.pageNumber);
  }

  return [...selected].sort((a, b) => a - b);
}

function buildManualMarkdown(input: {
  fileName?: string;
  pages: PageCandidate[];
}): string {
  const fileLabel = input.fileName?.trim() || "manual.pdf";
  const blocks = [`# Manual Identity Context`, `File: ${fileLabel}`];

  for (const page of input.pages) {
    if (!page.normalizedText) continue;
    blocks.push(``, `## Page ${page.pageNumber}`, page.normalizedText);
  }

  return blocks.join("\n").trim();
}

function clampMarkdown(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown;

  const head = markdown.slice(0, maxChars);
  const lastBoundary = Math.max(head.lastIndexOf("\n## Page "), head.lastIndexOf("\n"));
  const safeCut = lastBoundary > 500 ? lastBoundary : maxChars;

  return `${markdown.slice(0, safeCut).trim()}\n`;
}
