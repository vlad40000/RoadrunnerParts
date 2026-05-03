import "server-only";

import type { ExactModelUrlResolverInput, ExactModelUrlResolverResult } from "./exact-model-url-resolver.types";
import { searchExistingGroundingLayer, dedupeSearchHits } from "./search-adapter";
import type { SearchHit } from "./search-types";
import { cleanText, fetchHtml, htmlToText, normalizeModel } from "../providers/utils";

const DEFAULT_MAX_RESULTS = 12;

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    const paramsToDrop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "gad_source",
      "ref",
      "loc",
    ];

    for (const key of paramsToDrop) {
      parsed.searchParams.delete(key);
    }

    return stripTrailingSlash(parsed.toString());
  } catch {
    return url;
  }
}

function hostnameMatches(url: string, domain: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const target = domain.toLowerCase();
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

function pathLooksLikeModelPage(url: string, domain: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    if (domain.includes("searspartsdirect.com")) {
      return path.includes("/model/");
    }

    if (domain.includes("fix.com")) {
      return path.includes("/models/");
    }

    return path.includes("/model/") || path.includes("/models/");
  } catch {
    return false;
  }
}

function exactModelInUrl(url: string, model: string) {
  const normalized = normalizeUrl(url).toUpperCase();
  return normalized.includes(model);
}

function exactModelInText(text: string, model: string) {
  return cleanText(text).toUpperCase().includes(model);
}

function buildQueries(input: ExactModelUrlResolverInput) {
  const model = normalizeModel(input.model);
  const brand = input.brand?.toUpperCase() || "OTHER";
  
  const baseQueries = input.preferredQueries
    .map((q) => cleanText(q))
    .filter(Boolean);

  let templates: string[] = [];
  
  if (brand.includes("GE")) {
    templates = [
      `site:${input.domain} "${model}" diagrams`,
      `site:${input.domain} "${model}" schematics`,
      `site:${input.domain} "${model}" ge parts`,
    ];
  } else if (brand.includes("BOSCH")) {
    templates = [
      `site:${input.domain} "${model}" exploded view`,
      `site:${input.domain} "${model}" diagrams`,
      `site:${input.domain} "${model}" parts`,
    ];
  } else if (brand.includes("SAMSUNG") || brand.includes("LG")) {
    templates = [
      `site:${input.domain} "${model}" exploded view`,
      `site:${input.domain} "${model}" parts list`,
      `site:${input.domain} "${model}" diagrams`,
    ];
  } else {
    templates = [
      `site:${input.domain} "${model}"`,
      `site:${input.domain} "${model}" parts`,
      `site:${input.domain} "${model}" model`,
    ];
  }

  const queries = [...baseQueries, ...templates];

  const seen = new Set<string>();
  const output: string[] = [];

  for (const query of queries) {
    const normalized = query.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(query);
  }

  return output;
}

function scoreCandidate(input: {
  hit: SearchHit;
  model: string;
  domain: string;
}) {
  const title = cleanText(input.hit.title);
  const snippet = cleanText(input.hit.snippet ?? "");
  const url = normalizeUrl(input.hit.url);

  let score = 0;

  if (hostnameMatches(url, input.domain)) score += 100;
  if (pathLooksLikeModelPage(url, input.domain)) score += 120;
  if (exactModelInUrl(url, input.model)) score += 180;
  if (exactModelInText(title, input.model)) score += 140;
  if (exactModelInText(snippet, input.model)) score += 80;

  if (/official/i.test(title)) score += 20;
  if (/by schematic/i.test(title)) score += 25;
  if (/parts/i.test(title)) score += 10;
  if (/diagram/i.test(title) || /schematic/i.test(snippet)) score += 10;

  const rank = typeof input.hit.rank === "number" ? input.hit.rank : 999;
  score += Math.max(0, 20 - rank);

  if (!hostnameMatches(url, input.domain)) score -= 500;
  if (!pathLooksLikeModelPage(url, input.domain)) score -= 80;

  return score;
}

async function validateCandidatePage(input: {
  url: string;
  domain: string;
  model: string;
  score: number;
}) {
  try {
    const html = await fetchHtml(input.url);
    const text = htmlToText(html).toUpperCase();

    if (!text.includes(input.model)) {
      return { isValid: false };
    }

    if (input.domain.includes("searspartsdirect.com")) {
      if (
        !text.includes("BY SCHEMATIC") &&
        !text.includes("BY PART") &&
        !text.includes("OFFICIAL APPLIANCE PARTS")
      ) {
        return { isValid: false };
      }
    }

    if (input.domain.includes("fix.com")) {
      if (!text.includes("MODEL") && !text.includes("PARTS")) {
        return { isValid: false };
      }
    }

    // Capture expected parts target if Sears
    let expectedPartsTotal: number | undefined = undefined;
    if (input.domain.includes("searspartsdirect.com")) {
      const partsMatch = text.match(/(\d+)\s+PARTS\s+FOR\s+MODEL/i) || 
                         text.match(/FOUND\s+(\d+)\s+PARTS\s+FOR/i);
      if (partsMatch?.[1]) {
        expectedPartsTotal = parseInt(partsMatch[1], 10);
      }
    }

    return { 
      isValid: true, 
      expectedPartsTotal 
    };
  } catch (err: any) {
    // Soft Validation: If we hit a 403/429 or timeout but the candidate score is very high, 
    // trust the search result anyway. This is common when Sears blocks the validator but 
    // is present in Google index correctly.
    const isNetworkBlock = /403|429|abort|timeout/i.test(err.message);
    if (isNetworkBlock && input.score >= 300) {
      console.warn(`[SoftValidation] Trusting high-score URL (${input.score}) despite fetch error: ${err.message}`);
      return { isValid: true, isSoftValidated: true };
    }
    return { isValid: false };
  }
}

export async function resolveExactModelUrl(
  input: ExactModelUrlResolverInput,
): Promise<ExactModelUrlResolverResult> {
  const model = normalizeModel(input.model);
  if (!model) return null;

  const queries = buildQueries(input);

  const hits = dedupeSearchHits(
    await searchExistingGroundingLayer({
      queries,
      domain: input.domain,
      brandFamily: input.brand ?? undefined,
      model: model,
      maxResults: DEFAULT_MAX_RESULTS,
    }),
  );

  const candidates = hits
    .filter((hit) => hostnameMatches(hit.url, input.domain))
    .map((hit) => ({
      hit,
      url: normalizeUrl(hit.url),
      score: scoreCandidate({
        hit,
        model,
        domain: input.domain,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates.slice(0, 5)) {
    const validation = await validateCandidatePage({
      url: candidate.url,
      domain: input.domain,
      model,
      score: candidate.score,
    });

    if (validation.isValid) {
      const result: any = { url: candidate.url };
      if (validation.expectedPartsTotal) {
        result.expectedPartsTotal = validation.expectedPartsTotal;
        result.expectedPartsSource = "sears_exact_match_result";
        result.expectedPartsConfidence = 0.95;
      }
      return result;
    }
  }

  return null;
}
