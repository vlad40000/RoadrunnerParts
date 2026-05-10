import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const DEFAULT_INPUT = "scratch/ebay-html-final-52/listings.normalized.json";
const DEFAULT_OUTPUT = "scratch/image-evidence/reliableparts-images.json";

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
const delayMs = Number(args.get("delay-ms") || 350);

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

function normalizeUrl(value, baseUrl = "https://www.reliableparts.com/") {
  const raw = String(value || "").trim().replace(/^"|"$/g, "");
  if (!raw || raw.startsWith("data:")) return "";
  try {
    const url = new URL(raw, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
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

function isReliablePartsImageUrl(value) {
  try {
    const url = new URL(String(value || "").trim().replace(/^"|"$/g, ""));
    const host = url.hostname.toLowerCase();
    const href = url.href.toLowerCase();
    return (
      host === "cdn.amplifi.pattern.com" ||
      (host === "static.reliableparts.com" && href.includes("/media/catalog/product/"))
    );
  } catch {
    return false;
  }
}

function imageKeyFromUrl(value) {
  try {
    const url = new URL(String(value || "").trim().replace(/^"|"$/g, ""));
    const fileName = path.basename(url.pathname).toLowerCase();
    const match = fileName.match(/^([a-f0-9-]{20,})(?:_(?:small|large))?\.(?:webp|jpg|jpeg|png)$/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function loadReliablePartsUrlMap(filePath) {
  const map = new Map();
  const rows = [];
  const modelPages = [];
  const imageRows = [];
  if (!filePath || !fs.existsSync(filePath)) return { map, rows, modelPages, imageRows, expandedRows: [], expansionErrors: [] };

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const url = normalizeUrl(raw.split(",")[0]);
    if (isReliablePartsImageUrl(url)) {
      const imageKey = imageKeyFromUrl(url);
      if (imageKey && !imageRows.some((row) => row.imageUrl === url)) {
        imageRows.push({ imageUrl: url, imageKey, source: "url_csv_image" });
      }
      continue;
    }
    if (isReliablePartsModelPage(url)) {
      modelPages.push(url);
      continue;
    }
    const partNumber = partNumberFromReliablePartsUrl(url);
    if (!url || !partNumber) continue;
    rows.push({ partNumber, url });
    if (!map.has(partNumber)) map.set(partNumber, { url, source: "url_csv" });
  }

  return { map, rows, modelPages: [...new Set(modelPages)], imageRows, expandedRows: [], expansionErrors: [] };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 RoadrunnerParts local image evidence harvester",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedImageUrl(value) {
  const url = String(value || "").toLowerCase();
  return (
    !url ||
    url.startsWith("data:") ||
    /logo|favicon|icon|banner|store-locator|image-coming-soon|placeholder|no-image/.test(url)
  );
}

function addCandidate(candidates, candidate) {
  const imageUrl = normalizeUrl(candidate.imageUrl, candidate.pageUrl);
  if (isBlockedImageUrl(imageUrl)) return;
  const thumbnailUrl = normalizeUrl(candidate.thumbnailUrl || imageUrl, candidate.pageUrl);
  if (candidates.some((existing) => existing.imageUrl === imageUrl)) return;
  candidates.push({
    imageUrl,
    thumbnailUrl,
    pageUrl: candidate.pageUrl,
    pageUrlSource: candidate.pageUrlSource,
    source: "reliableparts.com",
    sourceDomain: "reliableparts.com",
    imageHost: (() => {
      try {
        return new URL(imageUrl).hostname;
      } catch {
        return "";
      }
    })(),
    title: candidate.title || "",
    alt: candidate.alt || "",
    selector: candidate.selector || "",
    evidenceType: candidate.evidenceType || "distributor_product_image",
    reviewStatus: "candidate_needs_watermark_review",
    listingUsePolicy: "image evidence only; operator must verify watermark/use rights and approve physical sale photos before staging",
  });
}

function amplifiVariants(value) {
  const url = normalizeUrl(value);
  if (!url) return [];
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "cdn.amplifi.pattern.com") return [];
    const match = parsed.pathname.match(/^\/([^/]+?)(?:_(small|large))?\.webp$/i);
    if (!match) return [];
    const base = match[1];
    return [
      `https://cdn.amplifi.pattern.com/${base}_small.webp`,
      `https://cdn.amplifi.pattern.com/${base}_large.webp`,
      `https://cdn.amplifi.pattern.com/${base}.webp`,
    ];
  } catch {
    return [];
  }
}

function addAmplifiVariants(candidates) {
  const seeds = candidates
    .map((candidate) => candidate.imageUrl)
    .filter((url) => {
      try {
        return new URL(url).hostname.toLowerCase() === "cdn.amplifi.pattern.com";
      } catch {
        return false;
      }
    });
  for (const seed of seeds) {
    for (const variantUrl of amplifiVariants(seed)) {
      addCandidate(candidates, {
        pageUrl: "",
        pageUrlSource: "amplifi_variant",
        imageUrl: variantUrl,
        thumbnailUrl: variantUrl,
        title: "Amplifi variant image",
        selector: "derived Amplifi image variant",
        evidenceType: "distributor_product_image_variant",
      });
    }
  }
}

function addCsvMatchedImages(candidates, imageRows) {
  const knownKeys = new Set(candidates.map((candidate) => imageKeyFromUrl(candidate.imageUrl)).filter(Boolean));
  for (const row of imageRows) {
    if (!row.imageKey || !knownKeys.has(row.imageKey)) continue;
    addCandidate(candidates, {
      pageUrl: "",
      pageUrlSource: row.source,
      imageUrl: row.imageUrl,
      thumbnailUrl: row.imageUrl,
      title: "CSV matched ReliableParts image",
      selector: "url-csv image row matched by image UUID",
      evidenceType: "csv_matched_distributor_product_image",
    });
  }
}

function extractModelProductEvidence(html, modelPageUrl) {
  const $ = cheerio.load(html);
  const evidence = new Map();
  $("#bkp-common-parts .dynamic-part, .dynamic-part").each((_, node) => {
    const item = $(node);
    const partUrl = normalizeUrl(
      item.find(".dynamic-part-url a").attr("href") ||
        item.find(".dynamic-part-name").closest("a").attr("href") ||
        item.find("a[href*='/gen-']").first().attr("href"),
      modelPageUrl,
    );
    const partNumber = partNumberFromReliablePartsUrl(partUrl);
    if (!partNumber) return;
    if (!evidence.has(partNumber)) evidence.set(partNumber, []);
    addCandidate(evidence.get(partNumber), {
      pageUrl: partUrl,
      pageUrlSource: "modelproduct_url_csv",
      imageUrl: item.find("img").attr("data-amsrc") || item.find("img").attr("src"),
      thumbnailUrl: item.find("img").attr("src"),
      title: cleanText(item.find(".dynamic-part-name").first().text()),
      alt: cleanText(item.find("img").attr("alt")),
      selector: "#bkp-common-parts .dynamic-part img",
      evidenceType: "model_common_part_image",
    });
  });
  return evidence;
}

function extractProductUrls(html, baseUrl) {
  const urls = new Set();
  const matches = String(html || "").matchAll(/(?:https?:\/\/www\.reliableparts\.com)?\/gen-[a-z0-9]+\.html/gi);
  for (const match of matches) {
    const url = normalizeUrl(match[0], baseUrl);
    if (url) urls.add(url);
  }
  return [...urls];
}

async function expandModelPages(reliablePartsUrls) {
  const modelImageEvidence = new Map();
  for (const modelPageUrl of reliablePartsUrls.modelPages || []) {
    try {
      const html = await fetchText(modelPageUrl);
      for (const url of extractProductUrls(html, modelPageUrl)) {
        const partNumber = partNumberFromReliablePartsUrl(url);
        if (!partNumber) continue;
        reliablePartsUrls.expandedRows.push({ partNumber, url, modelPageUrl });
        if (!reliablePartsUrls.map.has(partNumber)) {
          reliablePartsUrls.map.set(partNumber, { url, source: "modelproduct_url_csv" });
        }
      }
      for (const [partNumber, images] of extractModelProductEvidence(html, modelPageUrl)) {
        modelImageEvidence.set(partNumber, images);
      }
    } catch (error) {
      reliablePartsUrls.expansionErrors.push({ modelPageUrl, error: error.message });
    }
  }
  return modelImageEvidence;
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractProductPageImages({ partNumber, pageUrl, pageUrlSource, html }) {
  const $ = cheerio.load(html);
  const title = cleanText($("h1.page-title span").first().text()) || cleanText($("title").first().text());
  const sku = cleanText($("#details-sku").first().text()) || cleanText($("[itemprop='sku']").first().text());
  const identityText = cleanText(`${title} ${sku} ${$("body").text()}`).toUpperCase();
  const identityMatch = identityText.includes(partNumber) ? "exact" : "mismatch_or_replacement";
  const candidates = [];

  const imageJsonMatches = [
    ...String(html).matchAll(/"images"\s*:\s*(\[[\s\S]*?\])\s*[,}]/g),
    ...String(html).matchAll(/"data"\s*:\s*(\[[\s\S]*?\])\s*[,}]/g),
  ];
  for (const match of imageJsonMatches) {
    try {
      const images = JSON.parse(htmlDecode(match[1].replace(/\\"/g, "\"")));
      for (const [index, image] of images.entries()) {
        addCandidate(candidates, {
          pageUrl,
          pageUrlSource,
          imageUrl: image.full || image.img || image.url || image.main?.url,
          thumbnailUrl: image.thumb || image.img || image.url || image.main?.url,
          title: `${title || partNumber} image ${image.position || index + 1}`,
          selector: "gallery-json images",
        });
      }
    } catch {
      // Other JSON-looking script fragments are ignored.
    }
  }

  const ogImage = $("meta[property='og:image']").attr("content");
  addCandidate(candidates, {
    pageUrl,
    pageUrlSource,
    imageUrl: ogImage,
    title,
    selector: "meta[property='og:image']",
  });

  $(".product.media img, [data-role='gallery-placeholder'] img, img[src*='cdn.amplifi.pattern.com'], img[data-amsrc*='cdn.amplifi.pattern.com']").each((_, node) => {
    const image = $(node);
    addCandidate(candidates, {
      pageUrl,
      pageUrlSource,
      imageUrl: image.attr("data-amsrc") || image.attr("data-src") || image.attr("src"),
      thumbnailUrl: image.attr("src"),
      title,
      alt: cleanText(image.attr("alt")),
      selector: "product/media img",
    });
  });

  return { title, sku, identityMatch, candidates };
}

const listings = parseJsonWithListings(inputPath);
const reliablePartsUrls = loadReliablePartsUrlMap(urlCsvPath);
const modelImageEvidence = await expandModelPages(reliablePartsUrls);
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
const images = [];
const missing = [];
const errors = [];

for (const [index, partNumber] of requestedParts.entries()) {
  const mappedPage = reliablePartsUrls.map.get(partNumber);
  const pageUrl = mappedPage?.url || `https://www.reliableparts.com/gen-${partNumber.toLowerCase()}.html`;
  const pageUrlSource = mappedPage?.source || "derived_part_number";
  try {
    const html = await fetchText(pageUrl);
    const product = extractProductPageImages({ partNumber, pageUrl, pageUrlSource, html });
    const candidates = [...(modelImageEvidence.get(partNumber) || [])];
    for (const candidate of product.candidates) addCandidate(candidates, candidate);
    addCsvMatchedImages(candidates, reliablePartsUrls.imageRows);
    addAmplifiVariants(candidates);

    if (product.identityMatch !== "exact") {
      missing.push({ partNumber, pageUrl, pageUrlSource, reason: "image_identity_mismatch_or_replacement", resolvedTitle: product.title, resolvedSku: product.sku });
    } else if (!candidates.length) {
      missing.push({ partNumber, pageUrl, pageUrlSource, reason: "image_not_found" });
    } else {
      images.push({
        partNumber,
        source: "reliableparts.com",
        evidenceType: "distributor_product_image_set",
        identityMatch: product.identityMatch,
        pageUrl,
        pageUrlSource,
        capturedAt: new Date().toISOString(),
        title: product.title,
        sku: product.sku,
        reviewStatus: "candidate_needs_watermark_review",
        listingUsePolicy: "image evidence only; operator must verify watermark/use rights and approve physical sale photos before staging",
        candidates,
      });
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
  sourceBoundary: "Captured distributor image URLs as review candidates only. Do not treat them as approved eBay listing photos.",
  counts: {
    requested: requestedParts.length,
    csvUrls: reliablePartsUrls.rows.length,
    csvImageUrls: reliablePartsUrls.imageRows.length,
    csvModelPageUrls: reliablePartsUrls.modelPages.length,
    expandedModelProductUrls: reliablePartsUrls.expandedRows.length,
    csvUrlsMatchedRequestedParts: requestedParts.filter((partNumber) => reliablePartsUrls.map.has(partNumber)).length,
    derivedFallbackUrls: requestedParts.filter((partNumber) => !reliablePartsUrls.map.has(partNumber)).length,
    found: images.length,
    imageCandidates: images.reduce((sum, item) => sum + item.candidates.length, 0),
    missing: missing.length,
    errors: errors.length,
    expansionErrors: reliablePartsUrls.expansionErrors.length,
  },
  images,
  missing,
  errors,
  expansionErrors: reliablePartsUrls.expansionErrors,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
console.log(`ReliableParts image evidence written to ${outputPath}`);
console.log(JSON.stringify(manifest.counts, null, 2));
