import fs from "fs";
import path from "path";

const DEFAULT_INPUT = "scratch/ge_dryer_listings.json";
const DEFAULT_OUTPUT_DIR = "scratch/ebay-html";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const outputDir = String(args.get("output-dir") || DEFAULT_OUTPUT_DIR);
const normalizedJsonPath = String(args.get("normalized-json") || path.join(outputDir, "listings.normalized.json"));
const imageManifestPath = args.get("image-manifest") ? String(args.get("image-manifest")) : "";
const localImageRoot = args.get("local-image-root") ? String(args.get("local-image-root")) : "";
const listingSheetPath = args.get("listing-sheet") ? String(args.get("listing-sheet")) : "";
const trustLocalPartImages = String(args.get("trust-local-part-images") || "").toLowerCase() === "true";
const batchSize = Math.max(0, Number(args.get("batch-size") || 0));
const limitArg = args.get("limit");
const partArg = args.get("part");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFilename(value) {
  return String(value || "listing")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseListingsArtifact(rawText) {
  const trimmed = rawText.trim();
  const candidates = [
    trimmed,
    trimmed.endsWith("}") ? trimmed : `${trimmed}\n}`,
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const listings = Array.isArray(parsed) ? parsed : parsed.listings;
      if (Array.isArray(listings)) return listings;
    } catch {
      // Try the next repair candidate.
    }
  }

  throw new Error(`Could not parse listings JSON from ${inputPath}`);
}

function loadImageCandidateMap(filePath) {
  if (!filePath) return new Map();

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  const map = new Map();

  if (!Array.isArray(records)) return map;

  for (const record of records) {
    const partNumber = String(record.partNumber || "").trim().toUpperCase();
    if (partNumber && Array.isArray(record.candidates) && record.candidates.length > 0) {
      map.set(partNumber, record.candidates);
    }
  }

  return map;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseDelimitedLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t").map((value) => value.trim());

  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function loadListingSheet(filePath) {
  if (!filePath) return null;

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const rows = [];
  const byPartNumber = new Map();

  for (const line of lines.slice(1)) {
    const values = parseDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    const partNumber = String(row.partnumber || row.part || row.mpn || "").trim().toUpperCase();
    if (!partNumber) continue;

    const normalized = {
      partNumber,
      partTitle: String(row.parttitle || row.title || "").trim(),
      diagId: String(row.diagid || row.diagramid || "").trim(),
      retail: String(row.retail || row.retailprice || "").trim(),
      ebayBuyNow: String(row.ebaybuynow || row.ebayprice || row.buynow || "").trim(),
    };

    rows.push(normalized);
    byPartNumber.set(partNumber, normalized);
  }

  return { rows, byPartNumber };
}

function imageBasename(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return path.basename(parsed.pathname).toLowerCase();
  } catch {
    return path.basename(raw.split(/[?#]/)[0]).toLowerCase();
  }
}

function toHtmlPath(filePath, fromDir) {
  const relative = path.relative(fromDir, filePath) || path.basename(filePath);
  return relative
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function loadLocalImageMap(rootDir) {
  const map = new Map();
  if (!rootDir || !fs.existsSync(rootDir)) return map;

  const allowedExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExts.has(ext)) continue;

      const key = entry.name.toLowerCase();
      const existing = map.get(key);
      if (!existing || fullPath.length < existing.length) {
        map.set(key, fullPath);
      }
    }
  }

  return map;
}

function resolveLocalImageCandidates(candidates, localImageMap, fromDir) {
  if (!localImageMap.size) return candidates;

  return candidates.map((candidate) => {
    const imageKey = imageBasename(candidate.imageUrl);
    const thumbnailKey = imageBasename(candidate.thumbnailUrl);
    const localImagePath = localImageMap.get(imageKey) || localImageMap.get(thumbnailKey) || "";
    if (!localImagePath) return candidate;

    const localUrl = toHtmlPath(localImagePath, fromDir);
    return {
      ...candidate,
      remoteImageUrl: candidate.imageUrl,
      imageUrl: localUrl,
      thumbnailUrl: localUrl,
      localImagePath,
      reviewStatus: candidate.reviewStatus || "local_operator_image",
    };
  });
}

function preferredLocalImageCandidate(partNumber, localImageMap, fromDir) {
  if (!localImageMap.size) return null;

  const base = String(partNumber || "").trim().toLowerCase();
  if (!base) return null;

  for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
    const localImagePath = localImageMap.get(`${base}${ext}`);
    if (!localImagePath) continue;

    const localUrl = toHtmlPath(localImagePath, fromDir);
    return {
      title: `${partNumber} local operator image`,
      imageUrl: localUrl,
      thumbnailUrl: localUrl,
      pageUrl: "",
      sourceDomain: "local-scratch",
      source: "local_operator_drop",
      score: 1000,
      reviewStatus: "local_operator_image",
      localImagePath,
    };
  }

  return null;
}

function imageCandidateKey(candidate) {
  return String(candidate?.imageUrl || candidate?.remoteImageUrl || "").trim();
}

function candidateSearchText(candidate) {
  return [
    candidate?.title,
    candidate?.pageUrl,
    candidate?.imageUrl,
    candidate?.remoteImageUrl,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
}

function candidateMatchesPartNumber(partNumber, candidate) {
  const part = String(partNumber || "").trim().toUpperCase();
  if (!part) return false;
  if (String(candidate?.sourceDomain || "") === "local-scratch") return true;
  return candidateSearchText(candidate).includes(part);
}

function candidateHasWatermarkRisk(candidate) {
  const text = [
    candidate?.sourceDomain,
    candidate?.title,
    candidate?.pageUrl,
    candidate?.imageUrl,
    candidate?.remoteImageUrl,
    candidate?.reviewStatus,
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  return [
    "watermark",
    "partsdr",
    "parts dr",
    "partswarehouse",
    "parts warehouse",
    "searspartsdirect",
    "sears",
    "reliableparts",
    "reliable parts",
    "partselect",
    "geapplianceparts",
    "geappliances",
    "products-salsify",
    "assets.geappliances",
    "cdn11.bigcommerce.com",
  ].some((needle) => text.includes(needle));
}

function candidateIsApprovedForPreview(candidate) {
  return String(candidate?.sourceDomain || "") === "local-scratch";
}

function mergeImageCandidates(partNumber, remoteCandidates, localImageMap, fromDir) {
  const preferred = trustLocalPartImages ? preferredLocalImageCandidate(partNumber, localImageMap, fromDir) : null;
  const resolvedRemote = resolveLocalImageCandidates(remoteCandidates, localImageMap, fromDir);
  const cleanExact = resolvedRemote.filter((candidate) =>
    candidateMatchesPartNumber(partNumber, candidate)
    && !candidateHasWatermarkRisk(candidate)
    && candidateIsApprovedForPreview(candidate),
  );
  const merged = preferred ? [preferred, ...cleanExact] : cleanExact;
  const seen = new Set();

  return merged.filter((candidate) => {
    const key = imageCandidateKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function formatDescription(description) {
  const raw = String(description || "").trim();
  if (!raw) return "<p>No generated description was provided.</p>";

  const allowBasicFormatting = (value) => escapeHtml(value)
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>")
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>");

  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((line) => line.startsWith("-"))) {
        const items = lines.map((line) => `<li>${escapeHtml(line.replace(/^-\s*/, ""))}</li>`).join("\n");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map(allowBasicFormatting).join("<br>")}</p>`;
    })
    .join("\n");
}

function renderSpecsRows(listing) {
  const specs = listing.specs || {};
  const rows = [
    ["Part Number", listing.partNumber],
    ["Diagram ID", firstNonEmpty(listing.diagId, listing.diagramId, listing.diagram_id, specs.diagId, specs.diagramId)],
    ["Retail", firstNonEmpty(listing.retail, listing.retailPrice, listing.retail_price, specs.retail, specs.retailPrice)],
    ["eBay Buy Now", firstNonEmpty(listing.ebayBuyNow, listing.ebay_buy_now, listing.ebayBuyNowPrice, listing.buyNowPrice, specs.ebayBuyNow)],
    ["Brand", specs.brand],
    ["MPN", specs.mpn || listing.partNumber],
    ["Type", specs.type],
    ["Condition", "Used"],
    ["Compatible Models", Array.isArray(specs.compatibleModels) ? specs.compatibleModels.join(", ") : ""],
  ].filter(([, value]) => String(value || "").trim());

  return rows
    .map(([label, value]) => `
          <tr>
            <th>${escapeHtml(label)}</th>
            <td>${escapeHtml(value)}</td>
          </tr>`)
    .join("");
}

function renderListingHtml(listing) {
  const title = String(listing.title || `${listing.partNumber} Appliance Part`).trim();
  const descriptionHtml = formatDescription(listing.description);
  const primaryImageCandidate = listing.imageCandidates?.[0] || null;
  const primaryImageReviewStatus = String(primaryImageCandidate?.reviewStatus || "");
  const primaryNeedsWatermarkReview = primaryImageReviewStatus.includes("watermark");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Outfit:wght@600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --secondary: #162033;
      --accent: #3b82f6;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      line-height: 1.6;
    }
    .top-nav {
      background: var(--secondary);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .back-btn {
      color: #fff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      transition: background 0.2s;
    }
    .back-btn:hover { background: rgba(255,255,255,0.2); }
    .brand { font-family: 'Outfit', sans-serif; font-weight: 800; color: white; font-size: 20px; }
    .brand span { color: var(--primary); }

    .container {
      max-width: 1100px;
      margin: 40px auto;
      padding: 0 20px;
    }

    .listing-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      background: var(--card);
      padding: 40px;
      border-radius: 24px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
    }

    @media (max-width: 900px) {
      .listing-grid { grid-template-columns: 1fr; }
    }

    .gallery-col { display: flex; flex-direction: column; gap: 20px; }
    .main-image-box {
      aspect-ratio: 1;
      background: #f8fafc;
      border-radius: 16px;
      border: 1px solid #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      overflow: hidden;
    }
    .main-image-box img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 20px 30px rgba(0,0,0,0.1));
      transition: transform 0.3s ease;
    }
    .main-image-box:hover img { transform: scale(1.05); }

    .thumbnails {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 12px;
    }
    .thumb {
      aspect-ratio: 1;
      border: 2px solid #f1f5f9;
      border-radius: 10px;
      padding: 6px;
      background: #fff;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumb:hover { border-color: var(--primary); transform: translateY(-2px); }
    .thumb.watermark-review { border-color: #f59e0b; background: #fffbeb; }
    .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply; }

    .details-col { display: flex; flex-direction: column; }
    .part-tag {
      font-size: 12px;
      font-weight: 800;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 800;
      margin: 0 0 20px;
      line-height: 1.2;
      color: var(--secondary);
    }

    .specs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .specs-table th {
      text-align: left;
      font-size: 13px;
      color: var(--text-muted);
      padding: 12px 0;
      border-bottom: 1px solid #f1f5f9;
      width: 140px;
    }
    .specs-table td {
      padding: 12px 0;
      border-bottom: 1px solid #f1f5f9;
      font-weight: 600;
      font-size: 14px;
    }

    .description-box {
      background: #f8fafc;
      padding: 24px;
      border-radius: 16px;
      border: 1px solid #f1f5f9;
    }
    .description-box h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 18px;
      margin: 0 0 16px;
    }
    .description-content { font-size: 15px; color: #475569; }
    .description-content ul { padding-left: 20px; margin: 16px 0; }
    .description-content li { margin-bottom: 8px; }

    .audit-meta {
      margin-top: 30px;
      padding: 16px;
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 12px;
      font-size: 13px;
      color: #92400e;
    }
    .audit-meta strong { color: #b45309; }
    .audit-meta.watermark-review {
      background: #fffbeb;
      border-color: #f59e0b;
      color: #92400e;
    }

    footer {
      margin-top: 60px;
      padding: 40px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <nav class="top-nav">
    <a href="index.html" class="back-btn">← Back to Dashboard</a>
    <div class="brand">Roadrunner<span>Parts</span></div>
    <div style="width: 140px"></div>
  </nav>

  <div class="container">
    <div class="listing-grid">
      <div class="gallery-col">
        <div class="main-image-box" id="mainImage">
          ${listing.imageUrl 
            ? `<img src="${escapeHtml(listing.imageUrl)}" alt="${escapeHtml(title)}">` 
            : `<div style="color: #cbd5e1; font-weight: 700;">IMAGE PENDING</div>`
          }
        </div>
        
        ${listing.imageCandidates && listing.imageCandidates.length > 1 ? `
        <div class="thumbnails">
          ${listing.imageCandidates.map((cand, i) => `
            <div class="thumb ${String(cand.reviewStatus || "").includes("watermark") ? "watermark-review" : ""}" 
                 title="Score: ${cand.score} | Domain: ${escapeHtml(cand.sourceDomain)} | Status: ${escapeHtml(cand.reviewStatus || "review")}"
                 data-image-url="${escapeHtml(cand.imageUrl)}"
                 onclick="const box = document.querySelector('#mainImage'); const img = box.querySelector('img') || box.appendChild(document.createElement('img')); img.src = this.dataset.imageUrl;">
              <img src="${escapeHtml(cand.imageUrl)}" alt="Candidate ${i + 1}">
            </div>
          `).join("\n")}
        </div>
        ` : ""}
      </div>

      <div class="details-col">
        <div class="part-tag">Appliance Component</div>
        <h1>${escapeHtml(title)}</h1>
        
        <table class="specs-table">
          <tbody>
            ${renderSpecsRows(listing)}
          </tbody>
        </table>

        <div class="description-box">
          <h2>Product Insights</h2>
          <div class="description-content">
            ${descriptionHtml}
          </div>
        </div>

        ${listing.imageCandidates && listing.imageCandidates.length > 0 ? `
        <div class="audit-meta ${primaryNeedsWatermarkReview ? "watermark-review" : ""}">
          <strong>Audit Insight:</strong> Top visual candidate from <strong>${escapeHtml(listing.imageCandidates[0].sourceDomain)}</strong> 
          with a quality score of <strong>${listing.imageCandidates[0].score}</strong>. 
          Status: <strong>${escapeHtml(primaryImageReviewStatus || "candidate_needs_operator_review")}</strong>. 
          ${primaryNeedsWatermarkReview ? "ReliableParts is mixed-trust; verify this image has no visible watermark before final staging." : "Verify for watermarks before final staging."}
        </div>` : ""}
      </div>
    </div>
  </div>

  <footer>
    RoadrunnerParts Internal Audit Tool &bull; Local Preview &bull; 2026
  </footer>
</body>
</html>
`;
}

function renderBatchNav(currentPage, totalPages) {
  if (totalPages <= 1) return "";

  return `
    <nav class="batch-nav" aria-label="Listing batches">
      ${Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        const fileName = page === 1 ? "index.html" : `batch-${String(page).padStart(2, "0")}.html`;
        return `<a class="${page === currentPage ? "active" : ""}" href="${fileName}">Batch ${page}</a>`;
      }).join("")}
    </nav>`;
}

function renderIndexHtml(records, options = {}) {
  const totalCount = Number(options.totalCount || records.length);
  const currentPage = Number(options.currentPage || 1);
  const totalPages = Number(options.totalPages || 1);
  const startIndex = Number(options.startIndex || 0);
  const cards = records
    .map((record, i) => {
      const hasImage = !!record.thumbnailUrl;
      const needsWatermarkReview = String(record.imageReviewStatus || "").includes("watermark");
      const delay = (i % 20) * 0.05;
      return `
      <div class="card ${hasImage ? "has-image" : "missing-image"}" onclick="location.href='./${escapeHtml(record.fileName)}'" style="animation-delay: ${delay}s">
        <div class="card-image">
           ${hasImage ? `<img src="${escapeHtml(record.thumbnailUrl || "")}" alt="${escapeHtml(record.partNumber)}" onerror="this.src='https://placehold.co/200x200?text=No+Image'">` : `<div class="placeholder">NO IMAGE</div>`}
        </div>
        <div class="card-body">
          <div class="part-title">#${startIndex + i + 1}</div>
          <div class="part-num">${escapeHtml(record.partNumber)}</div>
          <div class="part-title">${escapeHtml(record.title)}</div>
          <div class="source-badge ${record.imageSource && !needsWatermarkReview ? "success" : "warning"}">
            ${record.imageSource ? `${needsWatermarkReview ? "Watermark Review" : "Source"}: ${escapeHtml(record.imageSource)}` : "Pending Scan"}
          </div>
        </div>
      </div>`;
    })
    .join("");

  const imageCount = records.filter(r => r.imageSource).length;
  const watermarkReviewCount = records.filter(r => String(r.imageReviewStatus || "").includes("watermark")).length;
  const batchTitle = totalPages > 1 ? `Batch ${currentPage} of ${totalPages}` : "Review Batch";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoadrunnerParts Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Outfit:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --secondary: #162033;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --success: #10b981;
      --warning: #f59e0b;
      --glass: rgba(255, 255, 255, 0.8);
    }
    body { 
      margin: 0; 
      background: var(--bg); 
      color: var(--text); 
      font-family: 'Inter', sans-serif; 
      line-height: 1.5; 
    }
    header {
      background: var(--secondary);
      color: white;
      padding: 60px 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
      border-bottom: 4px solid var(--primary);
    }
    header::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(37, 99, 235, 0.1) 0%, transparent 70%);
      pointer-events: none;
    }
    .header-content {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { 
      font-family: 'Outfit', sans-serif;
      margin: 0 0 10px; 
      font-size: 42px; 
      font-weight: 800;
      letter-spacing: -1px;
    }
    h1 span { color: var(--primary); }
    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 24px;
    }
    .stat {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(12px);
      padding: 10px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .stat span { color: var(--primary); font-weight: 800; font-size: 16px; }

    main { 
      max-width: 1240px; 
      margin: -40px auto 80px; 
      padding: 0 20px;
      position: relative;
      z-index: 2;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    .card {
      background: var(--card-bg);
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      opacity: 0;
    }
    .card:hover {
      transform: translateY(-12px);
      box-shadow: 0 25px 30px -10px rgba(0,0,0,0.15), 0 15px 15px -10px rgba(0,0,0,0.05);
      border-color: var(--primary);
    }

    .card-image {
      aspect-ratio: 1;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px;
      position: relative;
      border-bottom: 1px solid #f1f5f9;
    }
    .card-image img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 10px 15px rgba(0,0,0,0.1));
    }
    .card-image .placeholder {
      font-weight: 800;
      color: #cbd5e1;
      font-size: 20px;
      letter-spacing: 2px;
    }

    .card-body {
      padding: 24px;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
    }
    .part-num {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 20px;
      color: var(--secondary);
      margin-bottom: 6px;
    }
    .part-title {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 40px;
      line-height: 1.6;
    }

    .source-badge {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 6px 12px;
      border-radius: 8px;
      display: inline-block;
      margin-top: auto;
      letter-spacing: 0.5px;
    }
    .source-badge.success { background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
    .source-badge.warning { background: #fffbeb; color: #92400e; border: 1px solid #fef3c7; }
    .batch-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 0 24px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 14px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.04);
    }
    .batch-nav a {
      color: var(--secondary);
      text-decoration: none;
      font-weight: 800;
      font-size: 13px;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .batch-nav a.active {
      color: white;
      border-color: var(--primary);
      background: var(--primary);
    }

    footer {
      text-align: center;
      padding: 60px 40px;
      color: var(--text-muted);
      font-size: 13px;
      background: #f1f5f9;
      border-top: 1px solid #e2e8f0;
    }

    /* Animation */
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.9) translateY(30px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .card { animation: fadeInScale 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>Roadrunner<span>Parts</span> Audit</h1>
      <p>${escapeHtml(batchTitle)} - local image collection review</p>
      <div class="stats-bar">
        <div class="stat"><span>${records.length}</span> In This Batch</div>
        <div class="stat"><span>${totalCount}</span> Total Parts</div>
        <div class="stat"><span>${imageCount}</span> Visuals Discovered</div>
        <div class="stat"><span>${watermarkReviewCount}</span> Watermark Review</div>
        <div class="stat">Pipeline: <span>LOCAL REVIEW ONLY</span></div>
      </div>
    </div>
  </header>
  <main>
    ${renderBatchNav(currentPage, totalPages)}
    <div class="grid">${cards}</div>
  </main>
  <footer>
    &copy; 2026 RoadrunnerParts Advanced Systems. Built for serialized appliance resale.
  </footer>
</body>
</html>
`;
}

let listings = parseListingsArtifact(fs.readFileSync(inputPath, "utf8"));
const listingSheet = loadListingSheet(listingSheetPath);
if (listingSheet) {
  const listingByPartNumber = new Map(
    listings.map((listing) => [String(listing.partNumber || "").trim().toUpperCase(), listing]),
  );

  listings = listingSheet.rows
    .map((sheetRow) => {
      const listing = listingByPartNumber.get(sheetRow.partNumber);
      if (!listing) return null;

      return {
        ...listing,
        originalTitle: listing.title,
        title: sheetRow.partTitle || listing.title,
        partTitle: sheetRow.partTitle,
        diagId: sheetRow.diagId,
        retail: sheetRow.retail,
        ebayBuyNow: sheetRow.ebayBuyNow,
        specs: {
          ...(listing.specs || {}),
          diagramId: sheetRow.diagId,
          retail: sheetRow.retail,
          ebayBuyNow: sheetRow.ebayBuyNow,
        },
      };
    })
    .filter(Boolean);
}
if (partArg) {
  listings = listings.filter(l => String(l.partNumber || "").toUpperCase() === partArg.toUpperCase());
}
if (limitArg) {
  listings = listings.slice(0, Number(limitArg));
}
const imageCandidateMap = loadImageCandidateMap(imageManifestPath);
fs.mkdirSync(outputDir, { recursive: true });
const localImageMap = loadLocalImageMap(localImageRoot);

const records = listings.map((listing, index) => {
  const partNumber = String(listing.partNumber || `listing-${index + 1}`);
  const imageCandidates = mergeImageCandidates(
    partNumber,
    imageCandidateMap.get(partNumber.toUpperCase()) || [],
    localImageMap,
    outputDir,
  );
  const listingForHtml = {
    ...listing,
    imageUrl: imageCandidates[0]?.imageUrl || listing.imageUrl || null,
    imageCandidates,
  };
  const fileName = `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(partNumber)}.html`;
  fs.writeFileSync(path.join(outputDir, fileName), renderListingHtml(listingForHtml));
  return {
    partNumber,
    title: String(listing.title || ""),
    fileName,
    imageSource: imageCandidates[0]?.sourceDomain || "",
    imageReviewStatus: imageCandidates[0]?.reviewStatus || "",
    thumbnailUrl: imageCandidates[0]?.thumbnailUrl || imageCandidates[0]?.imageUrl || "",
  };
});

if (batchSize > 0 && records.length > batchSize) {
  const totalPages = Math.ceil(records.length / batchSize);
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const startIndex = pageIndex * batchSize;
    const pageRecords = records.slice(startIndex, startIndex + batchSize);
    const fileName = pageIndex === 0 ? "index.html" : `batch-${String(pageIndex + 1).padStart(2, "0")}.html`;
    fs.writeFileSync(path.join(outputDir, fileName), renderIndexHtml(pageRecords, {
      totalCount: records.length,
      currentPage: pageIndex + 1,
      totalPages,
      startIndex,
    }));
  }
} else {
  fs.writeFileSync(path.join(outputDir, "index.html"), renderIndexHtml(records));
}
fs.writeFileSync(normalizedJsonPath, JSON.stringify({
  listings: listings.map((listing) => {
    const partNumber = String(listing.partNumber || "").toUpperCase();
    const candidates = mergeImageCandidates(
      partNumber,
      imageCandidateMap.get(partNumber) || [],
      localImageMap,
      outputDir,
    );
    const imageCandidate = candidates[0] || null;
    return {
      ...listing,
      imageCandidate: imageCandidate
        ? {
            imageUrl: imageCandidate.imageUrl,
            thumbnailUrl: imageCandidate.thumbnailUrl,
            pageUrl: imageCandidate.pageUrl,
            sourceDomain: imageCandidate.sourceDomain,
            score: imageCandidate.score,
            reviewStatus: imageCandidate.reviewStatus,
            remoteImageUrl: imageCandidate.remoteImageUrl,
            localImagePath: imageCandidate.localImagePath,
          }
        : null,
      imageCandidates: candidates,
    };
  }),
}, null, 2));

console.log(`Generated ${records.length} HTML files in ${outputDir}`);
console.log(`Index: ${path.join(outputDir, "index.html")}`);
console.log(`Normalized JSON: ${normalizedJsonPath}`);
