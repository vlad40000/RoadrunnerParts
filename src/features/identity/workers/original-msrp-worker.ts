import "server-only";

import { getManufacturerFamilyConfig } from "@/lib/providers/manufacturer/family-config";
import type { AgeBand } from "./appliance-age-worker";

export type ApplianceMsrpResult = {
  machineId: string;
  model: string;
  targetDate: string;
  originalMsrpCents: number | null;
  currency: string | null;
  confidence: "high" | "medium" | "low" | "none";
  manufacturerDomain: string | null;
  chosenArchiveUrl: string | null;
  chosenOriginalUrl: string | null;
  chosenTimestamp: string | null;
  evidenceLabel: string | null;
  evidenceSnippet: string | null;
  msrpCheckedAt: string;
};

export type OriginalMsrpWorkerInput = {
  machineId: string;
  brand: string | null;
  model: string;
  targetDate: string | null;
  ageBand: AgeBand;
  condition?: string | null;
  manufacturerDomains?: string[];
  manufacturerProductUrls?: string[];
  windowDaysBefore?: number;
  windowDaysAfter?: number;
  cdxLimitPerUrl?: number;
};

type Snapshot = {
  timestamp: string;
  originalUrl: string;
  archiveUrl: string;
};

type Candidate = {
  msrpCents: number;
  currency: string;
  manufacturerDomain: string;
  originalUrl: string;
  archiveUrl: string;
  timestamp: string;
  distanceDays: number;
  keywordDistanceChars: number;
  label: string;
  snippet: string;
};

const WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx";
const WAYBACK_WEB = "https://web.archive.org/web";

const MSRP_CUES = [
  /\bMSRP\b/i,
  /\bManufacturer(?:'s)?\s+Suggested\s+Retail\s+Price\b/i,
  /\bSuggested\s+Retail\s+Price\b/i,
  /\bList\s*Price\b/i,
];

const EXCLUDE_CONTEXT = [
  /\bper\s*month\b/i,
  /\b\/mo\b/i,
  /\bAPR\b/i,
  /\bfinanc/i,
  /\binstall/i,
  /\bdelivery\b/i,
  /\brebate\b/i,
  /\bsave\b/i,
  /\boff\b/i,
  /\bdiscount\b/i,
  /\bpromo\b/i,
  /\bcoupon\b/i,
  /\bbundle\b/i,
  /\bstarting\s+at\b/i,
  /\bas\s+low\s+as\b/i,
  /\bfrom\s+\$/i,
];

const MONEY_RE = /(?:\b(USD|CAD|AUD|EUR|GBP)\b\s*)?(?:US\$|CA\$|AU\$|€|£|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/gi;
const CURRENCY_RE = /\b(USD|CAD|AUD|EUR|GBP)\b/i;

function emptyMsrpResult(input: OriginalMsrpWorkerInput, evidenceSnippet: string): ApplianceMsrpResult {
  return {
    machineId: input.machineId,
    model: input.model,
    targetDate: input.targetDate || "",
    originalMsrpCents: null,
    currency: null,
    confidence: "none",
    manufacturerDomain: null,
    chosenArchiveUrl: null,
    chosenOriginalUrl: null,
    chosenTimestamp: null,
    evidenceLabel: null,
    evidenceSnippet,
    msrpCheckedAt: new Date().toISOString(),
  };
}

function isJunkCondition(condition: string | null | undefined) {
  const normalized = String(condition || "").toLowerCase();
  return /\b(junk|scrap|recycle|trash|parts\s*only|salvage|destroyed)\b/.test(normalized);
}

export function shouldEnqueueOriginalMsrp(input: {
  ageBand: AgeBand;
  condition?: string | null;
}) {
  if (input.ageBand === "current_recent" || input.ageBand === "strong_resale") return true;
  if (input.ageBand === "normal_used") return !isJunkCondition(input.condition);
  return false;
}

function parseIsoDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) ? date : null;
}

function yyyymmdd(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isManufacturerDomain(domain: string, allowedDomains: string[]) {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return allowedDomains.some((allowed) => {
    const candidate = allowed.toLowerCase().replace(/^www\./, "");
    return normalized === candidate || normalized.endsWith(`.${candidate}`);
  });
}

function deriveManufacturerDomains(input: OriginalMsrpWorkerInput) {
  const explicit = (input.manufacturerDomains || [])
    .map((domain) => domain.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  const family = getManufacturerFamilyConfig(input.brand, input.model);
  return [...new Set((family?.domains || []).map((domain) => domain.replace(/^www\./, "")))];
}

function generateGuessUrls(model: string, manufacturerDomain: string) {
  const encoded = encodeURIComponent(model.trim());
  const base = `https://${manufacturerDomain}`;
  return [
    `${base}/search?query=${encoded}`,
    `${base}/search/${encoded}`,
    `${base}/products/${encoded}`,
    `${base}/product/${encoded}`,
    `${base}/p/${encoded}`,
  ];
}

async function fetchWaybackSnapshots(input: {
  url: string;
  fromYyyymmdd: string;
  toYyyymmdd: string;
  limit: number;
}): Promise<Snapshot[]> {
  const params = new URLSearchParams({
    url: input.url,
    from: input.fromYyyymmdd,
    to: input.toYyyymmdd,
    output: "json",
    fl: "timestamp,original",
    filter: "statuscode:200",
    collapse: "digest",
    limit: String(input.limit),
  });
  const response = await fetch(`${WAYBACK_CDX}?${params.toString()}`);
  if (!response.ok) return [];
  const rows = (await response.json().catch(() => [])) as string[][];
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  return rows.slice(1).map((row) => ({
    timestamp: row[0],
    originalUrl: row[1],
    archiveUrl: `${WAYBACK_WEB}/${row[0]}id_/${row[1]}`,
  }));
}

function cleanHtmlText(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyToCents(value: string) {
  const parsed = Number.parseFloat(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function currencyFrom(window: string, explicit?: string | null) {
  return explicit?.toUpperCase() || window.match(CURRENCY_RE)?.[1]?.toUpperCase() || "USD";
}

function snapshotDistanceDays(timestamp: string, targetDate: Date) {
  const snap = new Date(Date.UTC(
    Number(timestamp.slice(0, 4)),
    Number(timestamp.slice(4, 6)) - 1,
    Number(timestamp.slice(6, 8)),
  ));
  return Math.abs(Math.round((snap.getTime() - targetDate.getTime()) / 86400000));
}

function extractCandidates(input: {
  html: string;
  model: string;
  targetDate: Date;
  snapshot: Snapshot;
  manufacturerDomain: string;
}): Candidate[] {
  const text = cleanHtmlText(input.html);
  const modelUpper = input.model.trim().toUpperCase();
  const sourceEvidence = `${text} ${input.html} ${input.snapshot.originalUrl}`.toUpperCase();
  if (modelUpper && !sourceEvidence.includes(modelUpper)) return [];

  const candidates: Candidate[] = [];
  const distanceDays = snapshotDistanceDays(input.snapshot.timestamp, input.targetDate);

  for (const cue of MSRP_CUES) {
    for (const match of text.matchAll(new RegExp(cue.source, "gi"))) {
      const cueIndex = match.index ?? 0;
      const start = Math.max(0, cueIndex - 260);
      const end = Math.min(text.length, cueIndex + 420);
      const window = text.slice(start, end);
      if (EXCLUDE_CONTEXT.some((pattern) => pattern.test(window))) continue;

      for (const priceMatch of window.matchAll(MONEY_RE)) {
        const amount = priceMatch[2];
        const cents = moneyToCents(amount);
        if (cents === null || cents < 10000) continue;
        const localIndex = priceMatch.index ?? 0;
        const keywordDistanceChars = Math.abs(localIndex - (cueIndex - start));
        candidates.push({
          msrpCents: cents,
          currency: currencyFrom(window, priceMatch[1]),
          manufacturerDomain: input.manufacturerDomain,
          originalUrl: input.snapshot.originalUrl,
          archiveUrl: input.snapshot.archiveUrl,
          timestamp: input.snapshot.timestamp,
          distanceDays,
          keywordDistanceChars,
          label: `explicit:${match[0]}`,
          snippet: window.slice(Math.max(0, localIndex - 120), localIndex + 180).trim(),
        });
      }
    }
  }

  return candidates;
}

function chooseBest(candidates: Candidate[]) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const aScore = a.keywordDistanceChars * 5 + a.distanceDays;
    const bScore = b.keywordDistanceChars * 5 + b.distanceDays;
    return aScore - bScore;
  })[0];
}

function confidenceFor(candidate: Candidate): ApplianceMsrpResult["confidence"] {
  if (candidate.distanceDays <= 365 && candidate.keywordDistanceChars <= 80) return "high";
  if (candidate.label.startsWith("explicit:")) return "medium";
  return "low";
}

export async function runOriginalMsrpWorker(
  input: OriginalMsrpWorkerInput,
): Promise<ApplianceMsrpResult> {
  if (!shouldEnqueueOriginalMsrp({ ageBand: input.ageBand, condition: input.condition })) {
    return emptyMsrpResult(input, `MSRP lookup skipped by age-band gate: ${input.ageBand}`);
  }
  if (!input.targetDate) return emptyMsrpResult(input, "Missing target date from serial decode.");
  const targetDate = parseIsoDate(input.targetDate);
  if (!targetDate) return emptyMsrpResult(input, "Invalid target date from serial decode.");

  const manufacturerDomains = deriveManufacturerDomains(input);
  if (!manufacturerDomains.length) {
    return emptyMsrpResult(input, "No manufacturer domains resolved for MSRP lookup.");
  }

  const from = new Date(targetDate);
  from.setUTCDate(from.getUTCDate() - (input.windowDaysBefore ?? 365));
  const to = new Date(targetDate);
  to.setUTCDate(to.getUTCDate() + (input.windowDaysAfter ?? 365));
  const allCandidates: Candidate[] = [];

  for (const manufacturerDomain of manufacturerDomains) {
    const seedUrls = [
      ...(input.manufacturerProductUrls || []).filter((url) =>
        isManufacturerDomain(domainOf(url), [manufacturerDomain]),
      ),
      ...generateGuessUrls(input.model, manufacturerDomain),
    ];

    for (const seedUrl of [...new Set(seedUrls)]) {
      if (!isManufacturerDomain(domainOf(seedUrl), [manufacturerDomain])) continue;
      const snapshots = await fetchWaybackSnapshots({
        url: seedUrl,
        fromYyyymmdd: yyyymmdd(from),
        toYyyymmdd: yyyymmdd(to),
        limit: input.cdxLimitPerUrl ?? 10,
      }).catch(() => []);

      for (const snapshot of snapshots) {
        const html = await fetch(snapshot.archiveUrl).then((res) => res.ok ? res.text() : "").catch(() => "");
        if (!html) continue;
        allCandidates.push(...extractCandidates({
          html,
          model: input.model,
          targetDate,
          snapshot,
          manufacturerDomain,
        }));
      }
    }
  }

  const chosen = chooseBest(allCandidates);
  if (!chosen) return emptyMsrpResult(input, "No manufacturer-domain MSRP evidence found.");

  return {
    machineId: input.machineId,
    model: input.model,
    targetDate: input.targetDate,
    originalMsrpCents: chosen.msrpCents,
    currency: chosen.currency,
    confidence: confidenceFor(chosen),
    manufacturerDomain: chosen.manufacturerDomain,
    chosenArchiveUrl: chosen.archiveUrl,
    chosenOriginalUrl: chosen.originalUrl,
    chosenTimestamp: chosen.timestamp,
    evidenceLabel: chosen.label,
    evidenceSnippet: chosen.snippet,
    msrpCheckedAt: new Date().toISOString(),
  };
}
