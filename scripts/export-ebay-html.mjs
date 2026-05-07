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
    const candidate = Array.isArray(record.candidates) ? record.candidates[0] : null;
    if (partNumber && candidate?.imageUrl) {
      map.set(partNumber, candidate);
    }
  }

  return map;
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
    ["Brand", specs.brand],
    ["MPN", specs.mpn || listing.partNumber],
    ["Type", specs.type],
    ["Condition", specs.condition],
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
  const imageCandidate = listing.imageCandidate || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #f5f7fa;
      color: #1f2937;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.55;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d7dee8;
    }
    .header {
      padding: 22px 28px;
      background: #162033;
      color: #fff;
      border-bottom: 4px solid #2563eb;
    }
    .brand {
      font-size: 26px;
      font-weight: 800;
    }
    .brand span {
      color: #60a5fa;
    }
    .content {
      padding: 28px;
    }
    h1 {
      margin: 0 0 18px;
      font-size: 24px;
      line-height: 1.25;
      color: #111827;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 24px;
    }
    th, td {
      border: 1px solid #d7dee8;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      width: 180px;
      background: #f1f5f9;
      color: #334155;
    }
    .section-title {
      margin: 22px 0 10px;
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .description p {
      margin: 0 0 14px;
    }
    .description ul {
      margin: 0 0 14px 20px;
      padding: 0;
    }
    .image-container {
      margin-bottom: 24px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #d7dee8;
      padding: 20px;
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .image-container img {
      max-width: 100%;
      max-height: 400px;
      object-fit: contain;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .no-image {
      color: #94a3b8;
      font-style: italic;
    }
    .policy {
      margin-top: 18px;
      padding: 14px 16px;
      background: #f8fafc;
      border-left: 4px solid #2563eb;
    }
    .footer {
      padding: 18px 28px;
      background: #f8fafc;
      border-top: 1px solid #d7dee8;
      color: #64748b;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Roadrunner<span>Parts</span></div>
    </div>
    <div class="content">
      <h1>${escapeHtml(title)}</h1>
      <div class="image-container">
        ${listing.imageUrl 
          ? `<img src="${escapeHtml(listing.imageUrl)}" alt="${escapeHtml(title)}">` 
          : `<div class="no-image">Product image pending review</div>`
        }
      </div>
      ${imageCandidate ? `<div class="policy">Image candidate source: <a href="${escapeHtml(imageCandidate.pageUrl || imageCandidate.imageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(imageCandidate.sourceDomain || "source page")}</a>. Candidate score ${escapeHtml(imageCandidate.score)}. Operator approval and image-use rights are still required before live marketplace use.</div>` : ""}
      <table>
        <tbody>${renderSpecsRows(listing)}
        </tbody>
      </table>
      <div class="section-title">Item Description</div>
      <div class="description">
        ${descriptionHtml}
      </div>
      <div class="section-title">Shipping & Handling</div>
      <div class="policy">Professionally packed for shipment. Shipping options and final handling terms are controlled by the eBay listing setup.</div>
      <div class="section-title">Returns</div>
      <div class="policy">Returns are handled under the return terms shown on the eBay listing. Do not treat this local preview as a live marketplace policy.</div>
    </div>
    <div class="footer">Local RoadrunnerParts HTML preview. Not deployed to eBay.</div>
  </div>
</body>
</html>
`;
}

function renderIndexHtml(records) {
  const links = records
    .map((record) => `
      <tr>
        <td><a href="./${escapeHtml(record.fileName)}">${escapeHtml(record.partNumber)}</a></td>
        <td>${escapeHtml(record.title)}</td>
        <td>${record.imageSource ? escapeHtml(record.imageSource) : "Pending"}</td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoadrunnerParts eBay HTML Previews</title>
  <style>
    body { margin: 0; padding: 24px; background: #f5f7fa; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
    main { max-width: 1000px; margin: 0 auto; background: #fff; border: 1px solid #d7dee8; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 26px; }
    p { color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #d7dee8; padding: 10px 12px; text-align: left; }
    th { background: #f1f5f9; }
    a { color: #1d4ed8; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>RoadrunnerParts eBay HTML Previews</h1>
    <p>${records.length} local listing HTML files generated. These are review artifacts only and are not deployed to eBay.</p>
    <table>
      <thead>
        <tr>
          <th>Part Number</th>
          <th>Title</th>
          <th>Top Image Source</th>
        </tr>
      </thead>
      <tbody>${links}
      </tbody>
    </table>
  </main>
</body>
</html>
`;
}

const listings = parseListingsArtifact(fs.readFileSync(inputPath, "utf8"));
const imageCandidateMap = loadImageCandidateMap(imageManifestPath);
fs.mkdirSync(outputDir, { recursive: true });

const records = listings.map((listing, index) => {
  const partNumber = String(listing.partNumber || `listing-${index + 1}`);
  const imageCandidate = imageCandidateMap.get(partNumber.toUpperCase()) || null;
  const listingForHtml = {
    ...listing,
    imageUrl: imageCandidate?.imageUrl || listing.imageUrl || null,
    imageCandidate,
  };
  const fileName = `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(partNumber)}.html`;
  fs.writeFileSync(path.join(outputDir, fileName), renderListingHtml(listingForHtml));
  return {
    partNumber,
    title: String(listing.title || ""),
    fileName,
    imageSource: imageCandidate?.sourceDomain || "",
  };
});

fs.writeFileSync(path.join(outputDir, "index.html"), renderIndexHtml(records));
fs.writeFileSync(normalizedJsonPath, JSON.stringify({
  listings: listings.map((listing) => {
    const partNumber = String(listing.partNumber || "").toUpperCase();
    const imageCandidate = imageCandidateMap.get(partNumber) || null;
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
          }
        : null,
    };
  }),
}, null, 2));

console.log(`Generated ${records.length} HTML files in ${outputDir}`);
console.log(`Index: ${path.join(outputDir, "index.html")}`);
console.log(`Normalized JSON: ${normalizedJsonPath}`);
