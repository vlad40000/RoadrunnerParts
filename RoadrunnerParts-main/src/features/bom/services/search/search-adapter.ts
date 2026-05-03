import "server-only";
import type { SearchAdapter, SearchHit } from "./search-types";
import { generateText } from "@/lib/gemini";

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
      const result = await generateText({
        model: "gemini-3-flash-preview",
        role: "analyzer",
        // Send the raw query into grounded search instead of wrapping it in an extra prompt.
        contents: query,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 1,
        },
      });

      if (!result || !Array.isArray(result.sources)) {
        return [];
      }

      return result.sources.map((s, index) =>
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
