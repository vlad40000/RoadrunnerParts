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
import { getBrandGateConfig } from "../../registry/brand-source-gate";

const BRAND_QUERY_TEMPLATES: Record<string, string[]> = {
  GE: [
    'site:geappliances.com "{model}" parts',
    'site:geappliances.com "{model}" manual',
    'site:searspartsdirect.com "{model}" GE',
  ],
  BOSCH: [
    'site:bosch-home.com "{model}" parts',
    'site:bosch-home.com "{model}" exploded view',
    'site:encompass.com "{model}" Bosch',
  ],
  SAMSUNG: [
    'site:samsung.com "{model}" parts',
    'site:samsungparts.com "{model}"',
    'site:searspartsdirect.com "{model}" Samsung',
  ],
  WHIRLPOOL: [
    'site:whirlpool.com "{model}" parts',
    'site:whirlpool.com "{model}" manual',
    'site:searspartsdirect.com "{model}" Whirlpool',
  ],
  LG: [
    'site:lg.com "{model}" parts',
    'site:lg.com "{model}" manual',
    'site:searspartsdirect.com "{model}" LG',
  ],
  MAYTAG: [
    'site:whirlpool.com "{model}" parts Maytag',
    'site:searspartsdirect.com "{model}" Maytag',
  ],
  KENMORE: [
    'site:searspartsdirect.com "{model}" Kenmore',
    'site:repairclinic.com "{model}" Kenmore',
  ],
  KITCHENAID: [
    'site:whirlpool.com "{model}" parts KitchenAid',
    'site:searspartsdirect.com "{model}" KitchenAid',
  ],
  FRIGIDAIRE: [
    'site:searspartsdirect.com "{model}" Frigidaire',
    'site:repairclinic.com "{model}" Frigidaire',
  ],
  ELECTROLUX: [
    'site:searspartsdirect.com "{model}" Electrolux',
    'site:repairclinic.com "{model}" Electrolux',
  ],
};

function applyTemplates(queries: string[], brand?: string, model?: string): string[] {
  if (!brand || !model || !BRAND_QUERY_TEMPLATES[brand.toUpperCase()]) {
    return queries;
  }

  const templates = BRAND_QUERY_TEMPLATES[brand.toUpperCase()];
  const augmented: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (query: string) => {
    const trimmed = query.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    augmented.push(trimmed);
  };

  for (const template of templates) {
    pushUnique(template.replace("{model}", model));
  }

  for (const query of queries) {
    pushUnique(query);
  }

  return augmented;
}

export const searchExistingGroundingLayer: SearchAdapter = async (input) => {
  let queries = input.queries.map((q) => q.trim()).filter(Boolean);
  
  // 1. Augment with brand-aware templates if model is known.
  // Put templates first so they are not lost when the grounded-search fanout is capped.
  if (input.brandFamily && input.model) {
    queries = applyTemplates(queries, input.brandFamily, input.model);
  }

  // 2. Filter by Brand Source Gate after augmentation so added templates obey the same policy.
  if (input.brandFamily) {
    const { forbiddenDomains } = getBrandGateConfig(input.brandFamily);
    queries = queries.filter((q) => {
      const isForbidden = forbiddenDomains.some((domain) => q.includes(`site:${domain}`));
      if (isForbidden) {
        console.warn(`[SearchGate] Blocking forbidden domain for brand ${input.brandFamily}: ${q}`);
        return false;
      }
      return true;
    });
  }

  if (!queries.length) return [];

  const maxResults = input.maxResults ?? 12;

  const settled = await Promise.allSettled(
    queries.slice(0, 5).map(async (query) => {
      const result = await generateText({
        model: "gemini-3.1-flash-lite-preview",
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
