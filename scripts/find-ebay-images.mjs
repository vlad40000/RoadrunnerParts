import fs from "fs";
import path from "path";

const DEFAULT_INPUT = "scratch/ebay-html/listings.normalized.json";
const DEFAULT_OUTPUT_DIR = "scratch/ebay-images";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const outputDir = String(args.get("output-dir") || DEFAULT_OUTPUT_DIR);
const limitArg = args.get("limit");
const maxCandidates = Number(args.get("max-candidates") || 6);
const delayMs = Number(args.get("delay-ms") || 700);
const filterPart = args.get("part");

const preferredDomains = [
  "geapplianceparts.com",
  "geappliances.com",
  "reliableparts.com",
  "reliableparts.ca",
  "genuinereplacementparts.com",
  "searspartsdirect.com",
  "encompass.com",
];

const watermarkedDomains = [
  "partsdr.com",
  "appliancepartspros.com",
  "repairclinic.com",
  "partselect.com",
  "partswarehouse.com",
  "fix.com",
  "ereplacementparts.com",
  "searspartsdirect.com",
];

const watermarkTextPatterns = [
  /watermark/i,
  /watermarked/i,
  /parts\s*dr/i,
  /partsdr/i,
  /appliance\s*parts\s*pros/i,
  /appliancepartspros/i,
  /repair\s*clinic/i,
  /repairclinic/i,
  /part\s*select/i,
  /partselect/i,
  /parts\s*warehouse/i,
  /partswarehouse/i,
  /grid\s*represents/i,
  /gridrepresents/i,
];

const blockedDomains = [
  "ebay.com",
  "amazon.com",
  "walmart.com",
  "pinterest.",
  "facebook.com",
  "youtube.com",
  "aliexpress.",
  "temu.",
];

function candidateSourceText(candidate) {
  return [
    candidate.sourceDomain,
    candidate.pageUrl,
    candidate.imageUrl,
    candidate.thumbnailUrl,
    candidate.title,
  ].join(" ").toLowerCase();
}

function isReliablePartsCandidate(candidate) {
  const host = candidate.sourceDomain || hostFromUrl(candidate.pageUrl) || hostFromUrl(candidate.imageUrl);
  return host.includes("reliableparts.com") || host.includes("reliableparts.ca");
}

function isOfficialGECandidate(candidate) {
  const host = candidate.sourceDomain || hostFromUrl(candidate.pageUrl) || hostFromUrl(candidate.imageUrl);
  return host.includes("geapplianceparts.com") || host.includes("geappliances.com");
}

function isWatermarkedCandidate(candidate) {
  const sourceText = candidateSourceText(candidate);

  return (
    watermarkedDomains.some((domain) => sourceText.includes(domain)) ||
    watermarkTextPatterns.some((pattern) => pattern.test(sourceText))
  );
}

function reviewStatusForCandidate(candidate) {
  if (blockedDomains.some((domain) => candidate.sourceDomain.includes(domain))) {
    return "blocked_marketplace_or_social";
  }

  if (isReliablePartsCandidate(candidate)) {
    return "candidate_needs_watermark_review";
  }

  if (!isOfficialGECandidate(candidate)) {
    return "candidate_needs_source_review";
  }

  return "candidate_needs_operator_review";
}

function isGenericNonProductImage(candidate) {
  const sourceText = [
    candidate.imageUrl,
    candidate.thumbnailUrl,
    candidate.title,
  ].join(" ").toLowerCase();

  if (/logo|favicon|icon|android-chrome|apple-touch-icon|banner|brands\.png|mega-menu|wysiwyg\/enhanced|categories|store-locator|diyrepair|btn-call|parts-hob-lockup|common\/icons|\/icons\//.test(sourceText)) {
    return true;
  }

  // GE/Salsify thumbnail transforms at this size are often site thumbnails or
  // generic gallery scrape noise, not usable eBay listing images.
  if (/\/w_(\d+),h_(\d+)\//.test(sourceText)) {
    const [, width, height] = sourceText.match(/\/w_(\d+),h_(\d+)\//) || [];
    if (Number(width) < 300 || Number(height) < 300) return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function loadListings() {
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const listings = Array.isArray(parsed) ? parsed : parsed.listings;
  if (!Array.isArray(listings)) {
    throw new Error(`No listings array found in ${inputPath}`);
  }
  return listings.slice(0, limitArg ? Number(limitArg) : undefined);
}

function scoreCandidate(candidate, listing) {
  const part = String(listing.partNumber || "").toUpperCase();
  const title = String(candidate.title || "").toUpperCase();
  const pageUrl = String(candidate.pageUrl || "").toUpperCase();
  const imageUrl = String(candidate.imageUrl || "").toUpperCase();
  const host = candidate.sourceDomain || hostFromUrl(candidate.pageUrl) || hostFromUrl(candidate.imageUrl);
  let score = 0;

  if (title.includes(part)) score += 35;
  if (pageUrl.includes(part)) score += 30;
  if (imageUrl.includes(part)) score += 20;
  if (host.includes("geapplianceparts.com") || host.includes("geappliances.com")) score += 110;
  if (host.includes("reliableparts.com") || host.includes("reliableparts.ca")) score += 20;
  if (preferredDomains.some((domain) => host.includes(domain))) score += 20;
  if (candidate.source === "reliableparts-direct") score += 10;
  
  if (blockedDomains.some((domain) => host.includes(domain))) score -= 200;
  
  if (candidate.width && candidate.height) {
    const minSide = Math.min(Number(candidate.width), Number(candidate.height));
    if (minSide >= 300) score += 8;
    if (minSide >= 800) score += 6;
  }
  
  if (isReliablePartsCandidate(candidate)) score -= 20;
  if (!isOfficialGECandidate(candidate) && !isReliablePartsCandidate(candidate)) score -= 15;
  if (/diagram|schematic|logo|manual|pdf|grid|watermark/i.test(`${candidate.title} ${candidate.imageUrl}`)) score -= 50;


  return score;
}

function normalizeCandidates(rawCandidates, listing) {
  const seen = new Set();
  return rawCandidates
    .map((candidate) => {
      const imageUrl = String(candidate.imageUrl || "").trim();
      const pageUrl = String(candidate.pageUrl || "").trim();
      const sourceDomain = hostFromUrl(pageUrl) || hostFromUrl(imageUrl);
      return {
        title: String(candidate.title || "").trim(),
        imageUrl,
        thumbnailUrl: String(candidate.thumbnailUrl || imageUrl).trim(),
        pageUrl,
        sourceDomain,
        width: candidate.width ? Number(candidate.width) : null,
        height: candidate.height ? Number(candidate.height) : null,
        source: candidate.source,
      };
    })
    .filter((candidate) => candidate.imageUrl && /^https?:\/\//i.test(candidate.imageUrl))
    .filter((candidate) => !isWatermarkedCandidate(candidate))
    .filter((candidate) => !isGenericNonProductImage(candidate))
    .filter((candidate) => {
      // Deduplicate by base URL to avoid same image in different sizes
      let key = candidate.imageUrl.toLowerCase();
      try {
        const urlObj = new URL(candidate.imageUrl);
        key = (urlObj.origin + urlObj.pathname).toLowerCase();
      } catch {
        // Fallback to full URL if invalid
      }
      
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, listing),
      reviewStatus: reviewStatusForCandidate(candidate),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 RoadrunnerParts local image discovery",
      "accept": "text/html,application/json;q=0.9,*/*;q=0.8",
      ...headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function searchDuckDuckGo(query) {
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const html = await fetchText(searchUrl);
  const token =
    html.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
    html.match(/vqd=([^&"']+)/)?.[1];
  if (!token) return [];

  const jsonUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,&p=1`;
  const text = await fetchText(jsonUrl, { referer: searchUrl, accept: "application/json,*/*;q=0.8" });
  const data = JSON.parse(text);
  return (data.results || []).map((item) => ({
    title: item.title,
    imageUrl: item.image,
    thumbnailUrl: item.thumbnail,
    pageUrl: item.url,
    width: item.width,
    height: item.height,
    source: "duckduckgo",
  }));
}

async function searchBingImages(query) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
  const html = await fetchText(url);
  const candidates = [];
  const matches = html.matchAll(/<a[^>]+class="iusc"[^>]+m="([^"]+)"/g);

  for (const match of matches) {
    try {
      const meta = JSON.parse(htmlDecode(match[1]));
      candidates.push({
        title: meta.t,
        imageUrl: meta.murl,
        thumbnailUrl: meta.turl,
        pageUrl: meta.purl,
        width: meta.w,
        height: meta.h,
        source: "bing",
      });
    } catch {
      // Ignore malformed metadata blocks.
    }
  }

  return candidates;
}

async function searchGEAppliancesDirect(listing) {
  const part = String(listing.partNumber || "").trim().toUpperCase();
  if (!part) return [];

  const pageUrl = `https://www.geapplianceparts.com/store/parts/spec/${part}`;
  const html = await fetchText(pageUrl);
  if (!html.toUpperCase().includes(part)) return [];

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? htmlDecode(titleMatch[1]) : `${listing.partNumber} GE Appliances`;

  const candidates = [];
  
  // Extract main image
  const ogImage = htmlDecode(html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || "");
  if (ogImage && !/logo|favicon|icon/i.test(ogImage)) {
    candidates.push({
      title: pageTitle,
      imageUrl: ogImage.startsWith("//") ? `https:${ogImage}` : ogImage,
      thumbnailUrl: ogImage.startsWith("//") ? `https:${ogImage}` : ogImage,
      pageUrl,
      sourceDomain: "geapplianceparts.com",
      source: "ge-appliances-direct",
      score: 195,
      reviewStatus: "candidate_needs_operator_review",
    });
  }

  // Look for additional gallery images
  const imgRegex = /data-fullurl=["']([^"']+)["']/g;
  let match;
  let pos = 1;
  while ((match = imgRegex.exec(html)) !== null) {
    let imgUrl = match[1];
    if (imgUrl.startsWith("//")) imgUrl = `https:${imgUrl}`;
    
    if (!candidates.find(c => c.imageUrl === imgUrl)) {
      candidates.push({
        title: `${pageTitle} (View ${pos++})`,
        imageUrl: imgUrl,
        thumbnailUrl: imgUrl,
        pageUrl,
        sourceDomain: "geapplianceparts.com",
        source: "ge-appliances-direct",
        score: 190,
        reviewStatus: "candidate_needs_operator_review",
      });
    }
  }

  return candidates;
}

async function searchReliablePartsDirect(listing) {
  const part = String(listing.partNumber || "").trim().toLowerCase();
  if (!part) return [];

  const pageUrl = `https://www.reliableparts.com/gen-${part}.html`;
  const html = await fetchText(pageUrl);
  if (!html.toUpperCase().includes(part.toUpperCase())) return [];

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? htmlDecode(titleMatch[1]) : `${listing.partNumber} Reliable Parts`;

  // Try multiple gallery JSON patterns
  const galleryMatch = html.match(/\[data-role=gallery-placeholder\]\":\s*({[\s\S]*?})\s*}/);
  const imagesMatch = html.match(/\"images\":\s*(\[[\s\S]*?\])/);
  const dataMatch = html.match(/"data":\s*(\[.*?\])/);
  
  let rawImages = [];
  try {
    if (galleryMatch) {
      const data = JSON.parse(galleryMatch[1]);
      rawImages = data.images || [];
    } else if (imagesMatch) {
      rawImages = JSON.parse(imagesMatch[1]);
    } else if (dataMatch) {
      rawImages = JSON.parse(dataMatch[1].replace(/\\/g, ""));
    }
  } catch (e) {
    // Fallback to basic scrape if JSON fails
  }

  if (rawImages.length > 0) {
    return rawImages
      .filter(img => (img.full || img.img || img.url || img.main?.url))
      .map((img, i) => ({
        title: `${pageTitle} (Image ${img.position || i + 1})`,
        imageUrl: img.full || img.img || img.url || img.main?.url,
        thumbnailUrl: img.thumb || img.img || img.url || img.main?.url,
        pageUrl,
        sourceDomain: "reliableparts.com",
        source: "reliableparts-direct",
        score: 185,
        reviewStatus: "candidate_needs_operator_review",
      }));
  }

  // Final fallback to og:image
  const imageUrl = htmlDecode(html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || "");
  if (!imageUrl || /logo|favicon|icon/i.test(imageUrl)) return [];
  
  return [{
    title: pageTitle,
    imageUrl,
    thumbnailUrl: imageUrl,
    pageUrl,
    sourceDomain: "reliableparts.com",
    source: "reliableparts-direct",
    score: 180,
    reviewStatus: "candidate_needs_operator_review",
  }];
}

async function findCandidates(listing) {
  const part = String(listing.partNumber || "").trim();
  const type = String(listing.specs?.type || "").trim();
  const queries = [
    `${part} GE appliance part image`,
    `${part} ${type} product image`,
  ].filter((query, index, all) => query.trim() && all.indexOf(query) === index);

  const raw = [];
  const errors = [];

  try {
    raw.push(...await searchGEAppliancesDirect(listing));
  } catch (error) {
    errors.push({
      source: "ge-appliances-direct",
      query: `https://www.geapplianceparts.com/store/parts/spec/${String(part).toUpperCase()}`,
      error: error.message,
    });
  }

  try {
    raw.push(...await searchReliablePartsDirect(listing));
  } catch (error) {
    errors.push({
      source: "reliableparts-direct",
      query: `https://www.reliableparts.com/gen-${String(part).toLowerCase()}.html`,
      error: error.message,
    });
  }

  for (const query of queries) {
    try {
      raw.push(...await searchDuckDuckGo(query));
    } catch (error) {
      errors.push({ source: "duckduckgo", query, error: error.message });
    }

    if (raw.length < maxCandidates) {
      try {
        raw.push(...await searchBingImages(query));
      } catch (error) {
        errors.push({ source: "bing", query, error: error.message });
      }
    }

    if (raw.length >= maxCandidates * 2) break;
    await sleep(150);
  }

  return {
    partNumber: part,
    title: listing.title,
    candidates: normalizeCandidates(raw, listing),
    errors,
  };
}

function renderGallery(records) {
  const cards = records.map((record) => {
    const primary = record.candidates[0];
    const candidateRows = record.candidates.map((candidate) => `
      <li>
        <a href="${escapeHtml(candidate.pageUrl || candidate.imageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(candidate.sourceDomain || "source")}</a>
        <span>score ${escapeHtml(candidate.score)}</span>
        <span class="${candidate.reviewStatus === "candidate_needs_watermark_review" ? "watermark-review" : ""}">${escapeHtml(candidate.reviewStatus)}</span>
      </li>`).join("");

    return `
      <article class="card ${primary ? "" : "missing"}">
        <div class="media">${primary ? `<img src="${escapeHtml(primary.thumbnailUrl || primary.imageUrl)}" alt="${escapeHtml(record.partNumber)} image candidate" loading="lazy">` : "<span>No candidate</span>"}</div>
        <div class="body">
          <h2>${escapeHtml(record.partNumber)}</h2>
          <p>${escapeHtml(record.title || "")}</p>
          <ul>${candidateRows || "<li>No image candidates found.</li>"}</ul>
        </div>
      </article>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoadrunnerParts Image Candidate Review</title>
  <style>
    body { margin: 0; padding: 24px; background: #f5f7fa; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
    header { max-width: 1240px; margin: 0 auto 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .note { color: #475569; max-width: 900px; }
    .grid { max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #fff; border: 1px solid #d7dee8; display: grid; grid-template-columns: 120px 1fr; min-height: 170px; }
    .card.missing { border-color: #fca5a5; }
    .media { background: #eef2f7; display: flex; align-items: center; justify-content: center; padding: 8px; color: #64748b; font-weight: 700; }
    .media img { max-width: 100%; max-height: 150px; object-fit: contain; }
    .body { padding: 12px; }
    h2 { margin: 0 0 4px; font-size: 18px; }
    p { margin: 0 0 10px; color: #475569; font-size: 13px; }
    ul { margin: 0; padding-left: 18px; font-size: 12px; }
    li { margin-bottom: 5px; }
    a { color: #1d4ed8; font-weight: 700; }
    span { margin-left: 6px; color: #64748b; }
    .watermark-review { color: #b45309; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <h1>RoadrunnerParts Image Candidate Review</h1>
    <p class="note">${records.length} parts processed. These are source-discovered image candidates for operator review, not approved eBay listing photos. Known watermarked sources and watermark text are excluded. ReliableParts is mixed-trust and any remaining ReliableParts candidate is marked for watermark review instead of being auto-approved.</p>
  </header>
  <main class="grid">${cards}
  </main>
</body>
</html>
`;
}

const listings = loadListings();
const filteredListings = filterPart 
  ? listings.filter(l => String(l.partNumber || "").toUpperCase() === filterPart.toUpperCase())
  : listings;

fs.mkdirSync(outputDir, { recursive: true });

const records = [];
for (let i = 0; i < filteredListings.length; i += 1) {
  const listing = filteredListings[i];
  const part = listing.partNumber || `listing-${i + 1}`;
  console.log(`[${i + 1}/${filteredListings.length}] Finding image candidates for ${part}`);
  records.push(await findCandidates(listing));
  if (filteredListings.length > 1) await sleep(delayMs);
}


const manifest = {
  generatedAt: new Date().toISOString(),
  sourceInput: inputPath,
  usageBoundary: "Candidate/reference images only. Do not deploy to eBay without operator approval and image-use rights.",
  totalParts: records.length,
  partsWithCandidates: records.filter((record) => record.candidates.length > 0).length,
  records,
};

fs.writeFileSync(path.join(outputDir, "image-candidates.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outputDir, "index.html"), renderGallery(records));

console.log(`Image candidates written to ${path.join(outputDir, "image-candidates.json")}`);
console.log(`Gallery written to ${path.join(outputDir, "index.html")}`);
console.log(`Parts with candidates: ${manifest.partsWithCandidates}/${manifest.totalParts}`);
