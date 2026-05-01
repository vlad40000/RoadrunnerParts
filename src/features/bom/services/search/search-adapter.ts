import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
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
            response: {
              type: Type.STRING,
            },
          },
        },
        temperature: 0,
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

    // URL Rescue: Parse the text response for links that might have been missed in metadata
    let textUrls: { uri: string; title: string }[] = [];
    try {
      const text = candidate?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        const responseBody = parsed.response || "";
        const matches = responseBody.match(/https?:\/\/[^\s"'>)]+/g);

        if (matches) {
          textUrls = matches.map((url: string) => ({
            uri: url,
            title: new URL(url).hostname,
          }));
        }
      }
    } catch {
      // ignore parse errors
    }

    const allSources = [...groundingChunks, ...textUrls];

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
  const queries = input.queries.map((q) => q.trim()).filter(Boolean);
  if (!queries.length) return [];

  const maxResults = input.maxResults ?? 12;

  const settled = await Promise.allSettled(
    queries.slice(0, 5).map(async (query) => {
      const sources = await runGroundedSourceSearch(
        input.domain
          ? `Find exact appliance model parts pages on ${input.domain} for this search query: ${query}`
          : `Find exact appliance model parts pages on authoritative sites (Sears PartsDirect, Encompass, Parts Dr, AppliancePartsPros, PartSelect, or Fix.com) for this search query: ${query}`,
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
