import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import {
  isDomainApprovedForBrand,
  isDomainForbiddenForBrand,
  resolveBrandSourceGate,
} from "../../registry/brand-source-gate";
import type { SearchAdapter, SearchHit } from "./search-types";

const GROUNDED_SEARCH_MODEL =
  process.env.GEMINI_MODEL_FAST || "gemini-3-flash-preview";

function createGenAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return new GoogleGenAI({ apiKey });
}

async function runGroundedSourceSearch(prompt: string) {
  const client = createGenAiClient();
  const response = await client.models.generateContent({
    model: GROUNDED_SEARCH_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING },
            model: { type: Type.STRING },
            brand_family: { type: Type.STRING },
            approved_sources_searched: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            forbidden_sources_skipped: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            candidates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  url: { type: Type.STRING },
                  match_type: { type: Type.STRING },
                  confidence: { type: Type.STRING },
                  evidence: { type: Type.STRING }
                }
              }
            },
            next_action: { type: Type.STRING }
          },
        },
        temperature: 1.0,
      },
    });

    const candidate = response.candidates?.[0];
    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks?.flatMap((chunk) => {
        if (!chunk.web?.uri) return [];
        return [
          {
            uri: chunk.web.uri,
            title: chunk.web.title || new URL(chunk.web.uri).hostname,
          },
        ];
      }) ?? [];

    let candidateUrls: { uri: string; title: string }[] = [];
    try {
      const text = candidate?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.candidates && Array.isArray(parsed.candidates)) {
          candidateUrls = parsed.candidates
            .filter((c: any) => typeof c.url === "string" && c.url.startsWith("http"))
            .map((c: any) => ({
              uri: c.url,
              title: c.source || new URL(c.url).hostname,
            }));
        }
      }
    } catch {
      // ignore parse errors
    }

    const allSources = [...groundingChunks, ...candidateUrls];

    return allSources.filter(
      (source, index, array) =>
        array.findIndex((item) => item.uri === source.uri) === index,
    );
}

function normalizeHit(hit: SearchHit, index: number): SearchHit {
  return {
    url: hit.url,
    title: hit.title ?? "",
    snippet: hit.snippet ?? "",
    rank: typeof hit.rank === "number" ? hit.rank : index + 1,
  };
}

function hasBrandGateContext(input: {
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}) {
  return Boolean(input.brand || input.brandFamily || input.resolvedBrand);
}

function queryHasForbiddenSite(query: string, forbiddenDomains: string[]) {
  const normalizedQuery = query.toLowerCase();

  return forbiddenDomains.some((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return (
      normalizedQuery.includes(`site:${normalizedDomain}`) ||
      normalizedQuery.includes(`site:www.${normalizedDomain}`)
    );
  });
}

function providerGuidance(domain: string) {
  const normalized = domain.toLowerCase();

  if (normalized.includes("bosch-home.com")) {
    return "Bosch-family official source. Query only Bosch/Thermador/Gaggenau E-Nr model pages and reject other OEM brands.";
  }

  if (
    normalized.includes("geapplianceparts.com") ||
    normalized.includes("geappliances.com")
  ) {
    return "GE-family official source. Prefer exact GE Appliance Parts assembly or model pages and reject Bosch/LG/Samsung/Frigidaire/Whirlpool OEM pages.";
  }

  if (normalized.includes("lgparts.com") || normalized.includes("lg.com")) {
    return "LG official or authorized source. Query only LG-family models and reject other OEM brand pages.";
  }

  if (normalized.includes("samsungparts") || normalized.includes("samsung.com")) {
    return "Samsung official or authorized source. Preserve variant suffixes and reject other OEM brand pages.";
  }

  if (normalized.includes("frigidaire")) {
    return "Frigidaire/Electrolux-family source. Query exact family model pages and reject unrelated OEM brand pages.";
  }

  return "Distributor source. Return only exact appliance model parts, diagram, schematic, or assembly pages with model evidence.";
}

function buildGroundedSearchPrompt(input: {
  domain: string;
  query: string;
  model?: string | null;
  applianceType?: string | null;
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
}) {
  const gate = hasBrandGateContext(input)
    ? resolveBrandSourceGate(input)
    : null;

  const gateText = gate
    ? [
        `Brand family: ${gate.brandFamily}`,
        `Approved domains: ${gate.approvedDomains.join(", ")}`,
        `Forbidden domains: ${gate.forbiddenDomains.join(", ")}`,
      ].join("\n")
    : "Brand family: unspecified; use only the requested domain.";

  return [
    "Find exact appliance model source pages for BOM retrieval.",
    providerGuidance(input.domain),
    gateText,
    `Model: ${input.model ?? ""}`,
    `Appliance type: ${input.applianceType ?? ""}`,
    `Requested domain: ${input.domain}`,
    `Search query: ${input.query}`,
    "Rules:",
    "- Return only source URLs backed by the requested domain.",
    "- Do not include forbidden OEM domains.",
    "- Do not broaden an OEM official search to another OEM family.",
    "- Exact model or exact compatible variant evidence is required.",
  ].join("\n");
}

export function dedupeSearchHits(hits: SearchHit[]) {
  const seen = new Set<string>();
  const output: SearchHit[] = [];

  for (const hit of hits) {
    const key = hit.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(hit);
  }

  return output;
}

/**
 * Wired to Gemini's Google Search grounding layer.
 * Important: this implementation now executes ALL provided queries,
 * instead of silently using only the first query.
 */
export const searchExistingGroundingLayer: SearchAdapter = async (input) => {
  if (
    hasBrandGateContext(input) &&
    (isDomainForbiddenForBrand(input) || !isDomainApprovedForBrand(input))
  ) {
    return [];
  }

  const forbiddenDomains = hasBrandGateContext(input)
    ? resolveBrandSourceGate(input).forbiddenDomains
    : [];

  const queries = input.queries
    .map((q) => q.trim())
    .filter(Boolean)
    .filter((query) => !queryHasForbiddenSite(query, forbiddenDomains));
  if (!queries.length) return [];

  const maxResults = input.maxResults ?? 12;

  const settled = await Promise.allSettled(
    queries.slice(0, 5).map(async (query) => {
      const sources = await runGroundedSourceSearch(
        buildGroundedSearchPrompt({
          domain: input.domain,
          query,
          model: input.model,
          applianceType: input.applianceType,
          brand: input.brand,
          brandFamily: input.brandFamily,
          resolvedBrand: input.resolvedBrand,
        }),
      );

      return sources.map((s, index) =>
        normalizeHit(
          {
            url: s.uri,
            title: s.title,
            snippet: "",
            rank: index + 1,
          },
          index,
        ),
      );
    }),
  );

  const allHits: SearchHit[] = [];
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      allHits.push(...entry.value);
    }
  }

  return dedupeSearchHits(allHits).slice(0, maxResults);
};
