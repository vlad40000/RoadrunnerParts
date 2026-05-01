import "server-only";
import type {
  SupplierAssemblyIndex,
  SupplierAssemblyIndexItem,
} from "@/features/bom/services/source-tier-policy";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function htmlToReadableText(html: string) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export async function fetchExactSupplierUrl(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Exact supplier URL is required.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 RoadrunnerPartsManualControl/1.0 (+https://example.local)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
    });

    if (!res.ok) {
      throw new Error(`Supplier URL fetch failed with HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();

    return {
      finalUrl: res.url || url,
      contentType,
      html: body,
      text: htmlToReadableText(body),
    };
  } finally {
    clearTimeout(timer);
  }
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function absolutizeUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function stripTags(value: string) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function parseSupplierCountIndicator(text: string) {
  const input = String(text || "").replace(/\s+/g, " ").trim();

  const patterns: Array<{ regex: RegExp; label: string }> = [
    {
      regex: /\bViewing\s+\d+\s*(?:-|to)?\s*\d*\s*of\s*(\d{1,5})\b/i,
      label: "Viewing count",
    },
    {
      regex: /\bShowing\s+\d+\s*(?:-|to)\s*\d+\s*of\s*(\d{1,5})\b/i,
      label: "Showing count",
    },
    {
      regex: /\bResults?\s+\d+\s*(?:-|to)\s*\d+\s*of\s*(\d{1,5})\b/i,
      label: "Results count",
    },
    {
      regex: /\b\d+\s*(?:-|to)\s*\d+\s*of\s*(\d{1,5})\s+(?:parts?|items?|results?)\b/i,
      label: "Range count",
    },
    {
      regex: /\b(\d{1,5})\s+(?:parts?|items?)\b/i,
      label: "Parts count",
    },
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern.regex);
    if (!match?.[1]) continue;

    const count = Number(match[1]);
    if (!Number.isFinite(count) || count <= 0) continue;

    const start = Math.max(0, (match.index || 0) - 45);
    const end = Math.min(input.length, (match.index || 0) + match[0].length + 45);
    const evidence = input.slice(start, end).trim();

    return {
      count,
      evidence: evidence || match[0],
      source: pattern.label,
    };
  }

  return {
    count: null as number | null,
    evidence: null as string | null,
    source: null as string | null,
  };
}

function extractLinks(html: string, baseUrl: string) {
  const links: Array<{ href: string; text: string; title: string }> = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";

    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch?.[1]) continue;

    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i);
    const href = absolutizeUrl(hrefMatch[1], baseUrl);
    if (!href || !/^https?:\/\//i.test(href)) continue;

    const text = stripTags(inner);
    const title = stripTags(titleMatch?.[1] || text);

    links.push({ href, text, title });
  }

  return links;
}

function looksLikeAssemblyTitle(value: string) {
  const text = String(value || "").toLowerCase();
  if (!text || text.length < 4 || text.length > 140) return false;

  const positive =
    text.includes("parts") ||
    text.includes("diagram") ||
    text.includes("assembly") ||
    text.includes("basket") ||
    text.includes("tub") ||
    text.includes("console") ||
    text.includes("water inlet") ||
    text.includes("cover sheet") ||
    text.includes("documentation") ||
    text.includes("gearcase") ||
    text.includes("motor") ||
    text.includes("pump") ||
    text.includes("optional") ||
    text.includes("installation") ||
    text.includes("top") ||
    text.includes("cabinet") ||
    text.includes("door") ||
    text.includes("shelf") ||
    text.includes("control") ||
    text.includes("bulkhead");

  const negative =
    text.includes("privacy") ||
    text.includes("terms") ||
    text.includes("contact") ||
    text.includes("cart") ||
    text.includes("checkout") ||
    text.includes("login") ||
    text.includes("account") ||
    text.includes("javascript:") ||
    text.includes("facebook") ||
    text.includes("youtube");

  return positive && !negative;
}

function dedupeAssemblies(items: SupplierAssemblyIndexItem[]) {
  const seen = new Set<string>();
  const out: SupplierAssemblyIndexItem[] = [];

  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function buildSupplierIndexFromHtml(input: {
  supplier: string;
  canonicalModel: string;
  formattedModel: string;
  sourceUrl: string;
  finalUrl: string;
  html: string;
  text: string;
}): SupplierAssemblyIndex {
  const total = parseSupplierCountIndicator(input.text);

  const links = extractLinks(input.html, input.finalUrl);
  const assemblyItems = links
    .map((link) => {
      const title = link.title || link.text;
      if (!looksLikeAssemblyTitle(title)) return null;

      const count = parseSupplierCountIndicator(`${title} ${link.text}`);

      return {
        id: slugify(`${input.supplier}-${title}`),
        title,
        sourceUrl: link.href,
        supplierCount: count.count,
        countEvidence: count.evidence,
        selected: false,
        overrideCount: null,
        status: count.count ? "pending" : "count_unknown",
        actualCount: 0,
        error: null,
      } satisfies SupplierAssemblyIndexItem;
    })
    .filter(Boolean) as SupplierAssemblyIndexItem[];

  const deduped = dedupeAssemblies(assemblyItems);

  let assemblies = deduped;

  if (!assemblies.length || total.count) {
    const allItem: SupplierAssemblyIndexItem = {
      id: slugify(`${input.supplier}-all-model-parts`),
      title: "All Model Parts",
      sourceUrl: input.finalUrl || input.sourceUrl,
      supplierCount: total.count,
      countEvidence: total.evidence,
      selected: false,
      overrideCount: null,
      status: total.count ? "pending" : "count_unknown",
      actualCount: 0,
      error: null,
    };

    assemblies = [allItem, ...assemblies.filter((item) => item.title !== allItem.title)];
  }

  return {
    supplier: input.supplier,
    canonicalModel: input.canonicalModel,
    formattedModel: input.formattedModel,
    sourceUrl: input.sourceUrl,
    totalCount: total.count,
    totalCountEvidence: total.evidence,
    totalCountSourceUrl: input.finalUrl || input.sourceUrl,
    loadedAt: new Date().toISOString(),
    assemblies,
  };
}

export function selectedExpectedCount(
  assemblies: Array<{
    selected?: boolean;
    supplierCount?: number | null;
    overrideCount?: number | null;
  }>,
) {
  return assemblies
    .filter((item) => item.selected)
    .reduce((sum, item) => {
      const count = Number(item.overrideCount ?? item.supplierCount ?? 0);
      return sum + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);
}

export function getPartNumberLike(row: Record<string, unknown>) {
  return String(
    row.currentServicePartNumber ||
      row.current_service_part_number ||
      row.originalPartNumber ||
      row.original_part_number ||
      row.partNumber ||
      row.part_number ||
      "",
  )
    .trim()
    .toUpperCase();
}

export function mergeRowsByPartNumber(
  existingRows: Array<Record<string, unknown>>,
  newRows: Array<Record<string, unknown>>,
) {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const row of [...existingRows, ...newRows]) {
    const part = getPartNumberLike(row);
    const fallback = JSON.stringify({
      description: row.description || row.name || row.partDescription,
      section: row.section || row.assemblyTitle,
    });
    const key = part || fallback;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}
