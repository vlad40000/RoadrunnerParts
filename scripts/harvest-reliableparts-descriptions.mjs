import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const DEFAULT_INPUT = "scratch/ebay-html-final-52/listings.normalized.json";
const DEFAULT_OUTPUT = "scratch/description-evidence/reliableparts-descriptions.json";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const outputPath = String(args.get("output") || DEFAULT_OUTPUT);
const urlCsvPath = args.get("url-csv") ? String(args.get("url-csv")) : "";
const filterPart = args.get("part") ? String(args.get("part")).trim().toUpperCase() : "";
const limit = args.get("limit") ? Number(args.get("limit")) : null;
const delayMs = Number(args.get("delay-ms") || 450);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonWithListings(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.listings)) return parsed.listings;
  throw new Error(`Expected an array or { listings: [] } in ${filePath}`);
}

function partNumberFor(record) {
  return String(
    record.partNumber ||
      record.specs?.mpn ||
      record.phase1a?.PART_ID?.OEM_Part_Number ||
      record.ebay_listing_payload?.itemSpecifics?.MPN ||
      "",
  )
    .trim()
    .toUpperCase();
}

function partNumberFromReliablePartsUrl(value) {
  try {
    const url = new URL(String(value || "").trim().replace(/^"|"$/g, ""));
    if (!url.hostname.toLowerCase().endsWith("reliableparts.com")) return "";
    const match = url.pathname.match(/\/gen-([a-z0-9]+)\.html/i);
    return match ? match[1].toUpperCase() : "";
  } catch {
    return "";
  }
}

function isReliablePartsModelPage(value) {
  try {
    const url = new URL(String(value || "").trim().replace(/^"|"$/g, ""));
    return url.hostname.toLowerCase().endsWith("reliableparts.com") && url.pathname.includes("/modelproduct/index/view/");
  } catch {
    return false;
  }
}

function normalizeReliablePartsUrl(value, baseUrl = "https://www.reliableparts.com/") {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  if (!raw) return "";
  try {
    const url = new URL(raw, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function loadReliablePartsUrlMap(filePath) {
  const map = new Map();
  const rows = [];
  const modelPages = [];
  if (!filePath || !fs.existsSync(filePath)) return { map, rows, modelPages, expandedRows: [], expansionErrors: [] };

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const url = normalizeReliablePartsUrl(raw.split(",")[0]);
    if (isReliablePartsModelPage(url)) {
      modelPages.push(url);
      continue;
    }
    const partNumber = partNumberFromReliablePartsUrl(url);
    if (!url || !partNumber) continue;
    rows.push({ partNumber, url });
    if (!map.has(partNumber)) map.set(partNumber, { url, source: "url_csv" });
  }

  return { map, rows, modelPages: [...new Set(modelPages)], expandedRows: [], expansionErrors: [] };
}

function extractReliablePartsProductUrls(html, baseUrl) {
  const urls = new Set();
  const matches = String(html || "").matchAll(/(?:https?:\/\/www\.reliableparts\.com)?\/gen-[a-z0-9]+\.html/gi);
  for (const match of matches) {
    const url = normalizeReliablePartsUrl(match[0], baseUrl);
    if (url) urls.add(url);
  }
  return [...urls];
}

async function expandModelPageUrls(reliablePartsUrls) {
  for (const modelPageUrl of reliablePartsUrls.modelPages || []) {
    try {
      const html = await fetchText(modelPageUrl);
      const productUrls = extractReliablePartsProductUrls(html, modelPageUrl);
      for (const url of productUrls) {
        const partNumber = partNumberFromReliablePartsUrl(url);
        if (!partNumber) continue;
        reliablePartsUrls.expandedRows.push({ partNumber, url, modelPageUrl });
        if (!reliablePartsUrls.map.has(partNumber)) {
          reliablePartsUrls.map.set(partNumber, { url, source: "modelproduct_url_csv" });
        }
      }
    } catch (error) {
      reliablePartsUrls.expansionErrors.push({ modelPageUrl, error: error.message });
    }
  }
}

function cleanText(value) {
  const text = String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return repaired.includes("\uFFFD") ? text : repaired;
  } catch {
    return text;
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 RoadrunnerParts local evidence harvester",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function metaContent($, selector) {
  return cleanText($(selector).attr("content"));
}

function extractDescription(html) {
  const $ = cheerio.load(html);
  const selectors = [
    "#accordion .product.attribute.description .value .short-desc",
    ".product.attribute.description .value .short-desc",
    "#accordion .product.attribute.description .value",
    ".product.attribute.description .value",
    "[itemprop='description']",
    "meta[name='description']",
  ];

  for (const selector of selectors) {
    const node = $(selector).first();
    const text = selector.startsWith("meta") ? metaContent($, selector) : cleanText(node.text());
    if (text.length >= 30) {
      return { selector, text };
    }
  }

  return { selector: null, text: "" };
}

function extractProductFacts(html) {
  const $ = cheerio.load(html);
  const title =
    cleanText($("h1.page-title span").first().text()) ||
    cleanText($(".page-title span").first().text()) ||
    metaContent($, "meta[property='og:title']") ||
    cleanText($("title").first().text());
  const sku =
    cleanText($("#details-sku").first().text()) ||
    cleanText($("[itemprop='sku']").first().text()) ||
    metaContent($, "meta[property='product:retailer_item_id']");

  return { title, sku };
}

function normalizeEvidence({ partNumber, pageUrl, pageUrlSource, html, capturedAt }) {
  const description = extractDescription(html);
  const facts = extractProductFacts(html);
  const identityText = cleanText(`${facts.title} ${facts.sku} ${description.text}`).toUpperCase();
  const identityMatch = identityText.includes(partNumber) ? "exact" : "mismatch_or_replacement";

  return {
    partNumber,
    source: "reliableparts.com",
    evidenceType: "distributor_product_description",
    identityMatch,
    pageUrl,
    pageUrlSource,
    capturedAt,
    selector: description.selector,
    title: facts.title,
    sku: facts.sku,
    descriptionText: description.text,
    listingUsePolicy: "source evidence only; rewrite in Roadrunner wording before staging",
  };
}

const listings = parseJsonWithListings(inputPath);
const reliablePartsUrls = loadReliablePartsUrlMap(urlCsvPath);
await expandModelPageUrls(reliablePartsUrls);
const uniqueParts = [];
const seen = new Set();
for (const listing of listings) {
  const partNumber = partNumberFor(listing);
  if (!partNumber || seen.has(partNumber)) continue;
  if (filterPart && partNumber !== filterPart) continue;
  seen.add(partNumber);
  uniqueParts.push(partNumber);
}

const requestedParts = Number.isFinite(limit) && limit > 0 ? uniqueParts.slice(0, limit) : uniqueParts;
const generatedAt = new Date().toISOString();
const descriptions = [];
const missing = [];
const errors = [];

for (const [index, partNumber] of requestedParts.entries()) {
  const mappedPage = reliablePartsUrls.map.get(partNumber);
  const pageUrl = mappedPage?.url || `https://www.reliableparts.com/gen-${partNumber.toLowerCase()}.html`;
  const pageUrlSource = mappedPage?.source || "derived_part_number";
  try {
    const html = await fetchText(pageUrl);
    const evidence = normalizeEvidence({ partNumber, pageUrl, pageUrlSource, html, capturedAt: new Date().toISOString() });
    if (!evidence.descriptionText) {
      missing.push({ partNumber, pageUrl, pageUrlSource, reason: "description_block_not_found" });
    } else if (evidence.identityMatch !== "exact") {
      missing.push({
        partNumber,
        pageUrl,
        pageUrlSource,
        reason: "description_identity_mismatch_or_replacement",
        resolvedTitle: evidence.title,
        resolvedSku: evidence.sku,
      });
    } else {
      descriptions.push(evidence);
    }
  } catch (error) {
    errors.push({ partNumber, pageUrl, pageUrlSource, error: error.message });
  }

  if (index < requestedParts.length - 1 && delayMs > 0) {
    await sleep(delayMs);
  }
}

const manifest = {
  generatedAt,
  inputPath,
  urlCsvPath: urlCsvPath || null,
  source: "reliableparts.com",
  sourceBoundary: "Captured distributor HTML description blocks as review evidence only. Do not paste supplier prose directly into eBay listing copy.",
  counts: {
    requested: requestedParts.length,
    csvUrls: reliablePartsUrls.rows.length,
    csvModelPageUrls: reliablePartsUrls.modelPages.length,
    expandedModelProductUrls: reliablePartsUrls.expandedRows.length,
    csvUrlsMatchedRequestedParts: requestedParts.filter((partNumber) => reliablePartsUrls.map.has(partNumber)).length,
    derivedFallbackUrls: requestedParts.filter((partNumber) => !reliablePartsUrls.map.has(partNumber)).length,
    found: descriptions.length,
    missing: missing.length,
    errors: errors.length,
    expansionErrors: reliablePartsUrls.expansionErrors.length,
  },
  descriptions,
  missing,
  errors,
  expansionErrors: reliablePartsUrls.expansionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log(`ReliableParts description evidence written to ${outputPath}`);
console.log(JSON.stringify(manifest.counts, null, 2));
