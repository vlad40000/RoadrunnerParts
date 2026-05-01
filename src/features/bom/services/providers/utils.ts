import "server-only";
import { load } from "cheerio";

export function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBrand(value: string | null | undefined) {
  return cleanText(value).toLowerCase();
}

export function normalizeModel(value: string | null | undefined) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

export function absoluteUrl(base: string, href: string) {
  return new URL(href, base).toString();
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T>();

  for (const item of items) {
    map.set(keyFn(item), item);
  }

  return Array.from(map.values());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Deadline exceeded for ${label} (${ms}ms)`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    throw err;
  }
}

function isLikelyHtmlErrorPage(body: string) {
  const trimmed = body.trimStart();
  if (!/^<!doctype html/i.test(trimmed) && !/^<html/i.test(trimmed)) {
    return false;
  }

  const head = trimmed.slice(0, 3000);

  return (
    /<title>\s*(?:500|internal server error|application error|bad gateway|access denied|attention required|cloudflare|verify you are human)/i.test(head) ||
    /<h1[^>]*>\s*(?:500|internal server error|application error|bad gateway|access denied|attention required)/i.test(head) ||
    /datadome|perimeterx|incapsula|sucuri/i.test(head)
  );
}

export async function fetchHtml(url: string) {
  const minDelay = parseInt(process.env.BOM_FETCHER_MIN_DELAY || "0", 10);
  const randDelay = parseInt(process.env.BOM_FETCHER_RAND_DELAY || "0", 10);
  
  if (minDelay + randDelay > 0) {
    await sleep(Math.floor(Math.random() * randDelay) + minDelay);
  }

  const urlObj = new URL(url);
  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
          "cache-control": "no-cache",
          referer: `${urlObj.protocol}//${urlObj.host}/`,
          "sec-ch-ua":
            '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-site": "none",
          "sec-fetch-mode": "navigate",
          "sec-fetch-user": "?1",
          "sec-fetch-dest": "document",
          "upgrade-insecure-requests": "1",
        },
        signal: controller.signal,
        cache: "no-store",
        redirect: "follow",
      });

      if (!res.ok) {
        if ((res.status === 403 || res.status === 429) && attempt < maxAttempts) {
          await sleep(2500 * (attempt + 1));
          continue;
        }
        throw new Error(`Fetch failed ${res.status} for ${url}`);
      }

      const body = await res.text();

      if (isLikelyHtmlErrorPage(body)) {
        throw new Error(`Source returned an HTML error page for ${url}`);
      }

      return body;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        await sleep(1000);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`Fetch failed after ${maxAttempts} retries for ${url}`);
}

export function htmlToText(html: string) {
  const $ = load(html);
  $("script, style, noscript, svg").remove();
  return cleanText($("body").text());
}

export function decodeHtmlEntities(value: string) {
  const $ = load(`<div>${value}</div>`);
  return cleanText($.text());
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
