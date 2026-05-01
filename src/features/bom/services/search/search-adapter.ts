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
          requested_domain: { type: Type.STRING },
          candidates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                url: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence: { type: Type.STRING },
                evidence: { type: Type.STRING },
              },
            },
          },
          next_action: { type: Type.STRING },
        },
      },
      temperature: 0.2,
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

function buildGroundedSearchPrompt(input: {
  domain: string;
  query: string;
  model?: string | null;
  applianceType?: string | null;
}) {
  if (!input.model?.trim()) {
    throw new Error("Grounded search prompt blocked: model is required.");
  }

  if (!input.domain?.trim()) {
    throw new Error("Grounded search prompt blocked: domain is required.");
  }

  return [
    "Manual distributor-control lookup.",
    "Return exact appliance model source pages from the requested distributor domain only.",
    `Model: ${input.model.trim()}`,
    `Appliance type: ${input.applianceType ?? ""}`,
    `Requested domain: ${input.domain.trim()}`,
    `Search query: ${input.query.trim()}`,
    "Rules:",
    "- One supplier only.",
    "- Requested domain only.",
    "- No OEM broadening.",
    "- No fallback supplier.",
    "- No pricing.",
    "- No BOM extraction.",
    "- Return candidate diagram/model pages only.",
    "- Exact model or exact compatible model evidence is required.",
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
 * Strict manual control:
 * - one invocation
 * - one query maximum
 * - three URLs maximum
 * - throws on blank model/domain
 *
 * IMPORTANT:
 * Manual buttons should usually avoid this function entirely.
 * Only an explicit "Run One Lookup" action should call grounding.
 */
export const searchExistingGroundingLayer: SearchAdapter = async (input) => {
  if (!input.model?.trim()) {
    throw new Error("Manual grounded search blocked: model is required.");
  }

  if (!input.domain?.trim()) {
    throw new Error("Manual grounded search blocked: domain is required.");
  }

  if (
    hasBrandGateContext(input) &&
    (isDomainForbiddenForBrand(input) || !isDomainApprovedForBrand(input))
  ) {
    return [];
  }

  const forbiddenDomains = hasBrandGateContext(input)
    ? resolveBrandSourceGate(input).forbiddenDomains
    : [];

  const query = input.queries
    .map((q) => q.trim())
    .filter(Boolean)
    .filter((candidate) => !queryHasForbiddenSite(candidate, forbiddenDomains))[0];

  if (!query) return [];

  const sources = await runGroundedSourceSearch(
    buildGroundedSearchPrompt({
      domain: input.domain,
      query,
      model: input.model,
      applianceType: input.applianceType,
    }),
  );

  const hits = sources.map((s, index) =>
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

  return dedupeSearchHits(hits).slice(0, 3);
};
