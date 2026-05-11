import fs from "fs";
import path from "path";
import crypto from "crypto";

const scopePath = "scratch/current-ebay-scope.json";
const outputPath = "public/ebay_mockup_gallery.html";
const publicGalleryPath = "/ebay_mockup_gallery.html";
const publicImageDir = "public/ebay-current-images";
const publicImageBasePath = "/ebay-current-images";
const coverageOutputPath = "scratch/current-ebay-image-coverage.json";
const approvedImageRoot = "scratch/approved-images";
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const imageSearchRoots = [
  "scratch/approved-images",
  "scratch/HTDX100ED3WW Nameplate_Diagrams_Parts_Images",
  "scratch/image-evidence",
];

function dollars(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : "$0.00";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bRh\b/g, "RH")
    .replace(/\bLh\b/g, "LH")
    .replace(/\bWh\b/g, "White")
    .replace(/\bAsm\b/g, "Assembly")
    .replace(/\bCtr\b/g, "Center")
    .replace(/\bInlt\b/g, "Inlet")
    .replace(/\bCu\.ft\b/gi, "Cu. Ft.");
}

function partCategory(description) {
  const text = String(description || "").toLowerCase();
  if (text.includes("motor")) return "Motor and Drive";
  if (text.includes("timer") || text.includes("switch") || text.includes("resistor")) return "Controls";
  if (text.includes("thermostat") || text.includes("heater") || text.includes("mica") || text.includes("fuse")) return "Heat and Safety";
  if (text.includes("door") || text.includes("handle") || text.includes("bearing")) return "Door and Drum";
  if (text.includes("panel") || text.includes("cover") || text.includes("chassis") || text.includes("cap")) return "Cabinet";
  if (text.includes("blower") || text.includes("idler") || text.includes("pulley")) return "Airflow and Belt";
  return "Dryer Part";
}

function photoPlan(description) {
  const category = partCategory(description);
  if (category === "Controls") return ["Front label", "Connector pins", "Side profile", "Any wear"];
  if (category === "Heat and Safety") return ["Part face", "Terminals", "Mounting tabs", "Continuity/test note"];
  if (category === "Motor and Drive") return ["Motor body", "Shaft/pulley", "Connector", "Model label"];
  if (category === "Cabinet") return ["Full face", "Back side", "Edges/corners", "Any dents"];
  return ["Main angle", "Back side", "Mounting points", "Condition close-up"];
}

function normalizeToken(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function walkImages(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "ebay-listing-3") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(fullPath, out);
      continue;
    }
    if (imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath.replaceAll("\\", "/"));
    }
  }
  return out;
}

function imagePriority(filePath) {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("/approved-images/")) return 0;
  if (normalized.includes("/htdx100ed3ww nameplate_diagrams_parts_images/")) return 1;
  if (normalized.includes("/image-evidence/")) return 2;
  if (normalized.includes("/ebay-html/images/")) return 3;
  return 4;
}

function fileToUrl(filePath) {
  return copyImageToPublic(filePath).url;
}

function copyImageToPublic(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const ext = path.extname(normalized).toLowerCase();
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  const base = sanitizeAssetName(path.basename(normalized, ext));
  const fileName = `${base}-${hash}${ext}`;
  const outputFile = path.join(publicImageDir, fileName);
  fs.mkdirSync(publicImageDir, { recursive: true });
  fs.copyFileSync(normalized, outputFile);
  return {
    filePath: outputFile.replaceAll("\\", "/"),
    url: `${publicImageBasePath}/${fileName}`,
  };
}

function sanitizeAssetName(value) {
  return String(value || "part-image")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "part-image";
}

const projectImages = Array.from(new Set(imageSearchRoots.flatMap((root) => walkImages(root))))
  .filter((filePath) => !filePath.toLowerCase().includes("mockup-gallery-qa"))
  .sort((a, b) => imagePriority(a) - imagePriority(b) || a.length - b.length || a.localeCompare(b));

function localImagesForPart(partNumber) {
  const token = normalizeToken(partNumber);
  const matches = projectImages.filter((filePath) => normalizeToken(path.basename(filePath)).includes(token));
  return Array.from(new Set(matches));
}

function readParts() {
  const parsed = JSON.parse(fs.readFileSync(scopePath, "utf8"));
  const rows = Array.isArray(parsed.parts) ? parsed.parts : [];
  return rows.map((row, index) => {
    const partNumber = String(row.partNumber || "").trim().toUpperCase();
    const imageFiles = localImagesForPart(partNumber);
    const publicImages = imageFiles.map((filePath) => ({
      sourcePath: filePath,
      ...copyImageToPublic(filePath),
    }));
    const approvedImage = publicImages[0]?.url || "";
    const description = String(row.description || "Appliance Part").trim();
    const category = partCategory(description);
    return {
      index,
      partNumber,
      diagramId: String(row.diagramId || row["diagram id"] || "").trim(),
      description,
      displayDescription: titleCase(description),
      category,
      supersedes: String(row.supersedes || "").trim(),
      price: Number(row.price || 0),
      priceLabel: dollars(row.price),
      title: `GE ${partNumber} ${titleCase(description)} Used Dryer Part`,
      approvedImage,
      imageFiles: publicImages.map((image) => image.url),
      imageSourcePath: imageFiles[0] || "",
      publicImagePath: publicImages[0]?.filePath || "",
      publicImageUrl: publicImages[0]?.url || "",
      hasPhoto: Boolean(approvedImage),
      photoPlan: photoPlan(description),
    };
  });
}

const parts = readParts();
if (parts.length !== 41) {
  throw new Error(`Expected 41 current-scope parts, found ${parts.length}.`);
}
const partsWithImages = parts.filter((part) => part.hasPhoto).length;
const missingImages = parts.filter((part) => !part.hasPhoto).map((part) => part.partNumber);

const dataJson = JSON.stringify(parts);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoadrunnerParts Current 41 eBay Mockups</title>
  <style>
    :root {
      --blue: #3665f3;
      --blue-dark: #2451d6;
      --red: #e53238;
      --yellow: #f5af02;
      --green: #86b817;
      --text: #111820;
      --muted: #5f6b7a;
      --line: #e5e8ee;
      --soft: #f6f7f9;
      --panel: #ffffff;
      --shadow: 0 18px 48px rgba(17, 24, 39, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #ffffff;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    .site-header {
      height: 100px;
      display: grid;
      grid-template-columns: 110px 76px minmax(360px, 1fr) 144px 72px;
      align-items: center;
      gap: 12px;
      padding: 0 96px;
    }

    .logo {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: -2.4px;
      line-height: 1;
      white-space: nowrap;
    }

    .logo span:nth-child(1) { color: #e53238; }
    .logo span:nth-child(2) { color: #0064d2; }
    .logo span:nth-child(3) { color: #f5af02; }
    .logo span:nth-child(4) { color: #86b817; }

    .category {
      color: #555f6d;
      font-size: 13px;
      line-height: 1.08;
    }

    .category::after {
      content: "v";
      margin-left: 6px;
      color: #111820;
    }

    .search {
      height: 48px;
      border: 2px solid #1b1f24;
      border-radius: 999px;
      color: #6b7280;
      display: grid;
      grid-template-columns: 38px 1fr 170px;
      align-items: center;
      overflow: hidden;
      background: white;
    }

    .search-icon {
      display: grid;
      place-items: center;
      font-size: 18px;
      color: #555f6d;
    }

    .search-text {
      font-size: 16px;
    }

    .search-category {
      height: 100%;
      border-left: 1px solid #d8dde6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #4b5563;
    }

    .search-button {
      height: 48px;
      border: 1px solid var(--blue);
      color: var(--blue);
      border-radius: 999px;
      background: white;
      font-weight: 800;
      font-size: 14px;
    }

    .advanced {
      color: #5f6b7a;
      font-size: 12px;
    }

    .scope-strip {
      display: grid;
      grid-template-columns: minmax(220px, 300px) 1fr;
      gap: 18px;
      max-width: 1618px;
      margin: 0 auto;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fbfcfd;
    }

    .promo {
      max-width: 1618px;
      margin: 4px auto 24px;
      min-height: 58px;
      background: #421bc8;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 18px;
      font-weight: 800;
      font-size: 15px;
    }

    .promo-live {
      color: #20f084;
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }

    .promo-button {
      background: white;
      color: #421bc8;
      border-radius: 999px;
      padding: 9px 20px;
      font-size: 12px;
    }

    .scope-copy strong {
      display: block;
      font-size: 15px;
      margin-bottom: 4px;
    }

    .scope-copy span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }

    .part-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .part-pill {
      border: 1px solid var(--line);
      background: white;
      color: #334155;
      border-radius: 999px;
      min-width: 112px;
      height: 36px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .part-pill.active {
      border-color: var(--blue);
      color: var(--blue);
      box-shadow: 0 0 0 2px rgba(54, 101, 243, 0.12);
    }

    .page {
      max-width: 1618px;
      margin: 0 auto;
      padding: 0 0 64px;
    }

    .product-grid {
      display: grid;
      grid-template-columns: minmax(700px, 1fr) 580px;
      gap: 32px;
      align-items: start;
    }

    .media-column {
      min-width: 0;
    }

    .media-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 8px;
    }

    .thumbs {
      display: grid;
      gap: 10px;
      align-content: start;
    }

    .thumb {
      width: 70px;
      height: 90px;
      border-radius: 14px;
      border: 1px solid transparent;
      display: grid;
      place-items: center;
      background: #fff;
      color: #7a8594;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      overflow: hidden;
    }

    .thumb.active {
      border-color: #111820;
      box-shadow: 0 0 0 1px #111820;
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .main-image {
      min-height: 642px;
      border: 0;
      border-radius: 14px;
      background: #f3f3f3;
      display: grid;
      place-items: center;
      overflow: hidden;
      position: relative;
    }

    .media-float {
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 0;
      background: white;
      display: grid;
      place-items: center;
      font-size: 24px;
      box-shadow: 0 6px 18px rgba(17, 24, 39, 0.12);
      z-index: 2;
    }

    .float-expand { top: 18px; right: 72px; }
    .float-heart { top: 18px; right: 18px; }
    .float-prev { left: 18px; top: 50%; transform: translateY(-50%); }
    .float-next { right: 18px; top: 50%; transform: translateY(-50%); }

    .main-image img {
      width: 100%;
      height: 100%;
      max-height: 690px;
      object-fit: contain;
      background: white;
    }

    .photo-pending {
      width: min(540px, 78%);
      min-height: 360px;
      border: 2px dashed #d4dae4;
      border-radius: 18px;
      background: #f7f7f7;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 34px;
    }

    .photo-icon {
      width: 72px;
      height: 72px;
      border-radius: 22px;
      background: #eef3ff;
      color: var(--blue);
      display: grid;
      place-items: center;
      margin: 0 auto 18px;
      font-size: 34px;
      font-weight: 800;
    }

    .photo-pending h2 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.1;
    }

    .photo-pending p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }

    .under-media {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 30px 0 30px;
      color: #2f3a49;
      font-weight: 650;
    }

    .sell-buttons {
      display: contents;
    }

    .sell-pill {
      height: 42px;
      padding: 0 20px;
      border-radius: 999px;
      border: 1px solid #b7bec9;
      background: white;
      font-weight: 650;
      color: #111820;
    }

    .link-action {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #2f3a49;
      font-size: 14px;
    }





    .buy-box {
      padding-top: 4px;
    }

    .title {
      font-size: 24px;
      line-height: 1.22;
      letter-spacing: 0;
      margin: 0 0 16px;
      font-weight: 780;
    }

    .seller {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
    }

    .seller-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #c084fc;
      color: white;
      font-weight: 800;
    }

    .seller-name {
      font-weight: 750;
      font-size: 15px;
    }

    .seller-meta {
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }

    .price {
      font-size: 28px;
      font-weight: 820;
      margin: 22px 0 2px;
    }

    .pay-later {
      color: #111820;
      font-size: 14px;
      margin-bottom: 22px;
    }

    .row {
      display: grid;
      grid-template-columns: 116px 1fr;
      gap: 16px;
      padding: 14px 0;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 14px;
    }

    .row strong {
      color: #172033;
      justify-self: start;
    }

    .qty-control {
      display: grid;
      grid-template-columns: 1fr 44px 44px;
      border: 1px solid #d9dee7;
      border-radius: 6px;
      overflow: hidden;
      height: 48px;
      width: 100%;
      color: #172033;
    }

    .qty-control span {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 0;
    }

    .qty-control span:last-child {
      border-right: 0;
    }

    .button-stack {
      display: grid;
      gap: 12px;
      margin: 18px 0;
    }

    .cta {
      height: 56px;
      border-radius: 22px;
      border: 1px solid var(--blue);
      font-size: 16px;
      font-weight: 760;
      cursor: pointer;
      background: white;
      color: var(--blue);
    }

    .cta.primary {
      background: #0968f6;
      color: white;
      box-shadow: 0 7px 14px rgba(54, 101, 243, 0.2);
    }

    .cta.muted {
      border-color: #dfe4ec;
      color: #334155;
    }

    .service {
      padding: 16px 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      font-size: 14px;
    }

    .service strong {
      display: block;
      margin-bottom: 12px;
    }

    .checkline {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .checkline input {
      width: 14px;
      height: 14px;
    }

    .policy-list {
      display: grid;
      gap: 18px;
      margin-top: 22px;
      padding-top: 8px;
    }

    .policy {
      display: grid;
      grid-template-columns: 26px 1fr;
      gap: 12px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.35;
    }

    .policy-icon {
      width: 22px;
      height: 22px;
      color: #475569;
      font-weight: 900;
      display: grid;
      place-items: center;
    }

    .policy strong {
      display: block;
      color: #1f2937;
      margin-bottom: 2px;
    }

    .details-section {
      margin-top: 46px;
      display: grid;
      grid-template-columns: 1fr 430px;
      gap: 34px;
    }

    .description-panel {
      border-top: 1px solid var(--line);
      padding-top: 26px;
    }

    .description-panel h2,
    .similar h2 {
      margin: 0 0 18px;
      font-size: 26px;
    }

    .description-panel p {
      color: #334155;
      line-height: 1.65;
      max-width: 780px;
    }

    .spec-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 20px;
      max-width: 760px;
    }

    .spec {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfd;
      font-size: 13px;
    }

    .spec span {
      display: block;
      color: var(--muted);
      margin-bottom: 5px;
    }

    .photo-checklist {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 20px;
      background: #fbfcfd;
    }

    .photo-checklist h3 {
      margin: 0 0 14px;
      font-size: 17px;
    }

    .photo-checklist ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 10px;
    }

    .photo-checklist li {
      display: flex;
      gap: 10px;
      color: #334155;
      font-size: 14px;
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ef4444;
      margin-top: 5px;
      flex: 0 0 auto;
    }

    .status-dot.ready {
      background: #16a34a;
    }

    .similar {
      margin-top: 56px;
    }

    .similar-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }

    .similar-head a {
      color: var(--blue);
      text-decoration: none;
      font-weight: 700;
      font-size: 13px;
    }

    .similar-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(160px, 1fr));
      gap: 20px;
    }

    .similar-card {
      min-height: 280px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #f8fafc;
      overflow: hidden;
      position: relative;
      cursor: pointer;
    }

    .similar-tag {
      position: absolute;
      top: 12px;
      left: 12px;
      background: var(--blue);
      color: white;
      font-size: 11px;
      font-weight: 800;
      padding: 5px 8px;
      border-radius: 4px;
    }

    .similar-body {
      padding: 86px 12px 12px;
      color: #253044;
      font-size: 13px;
      font-weight: 650;
    }

    .similar-price {
      color: #111820;
      margin-top: 6px;
      font-weight: 800;
    }

    @media (max-width: 1100px) {
      .site-header,
      .scope-strip,
      .page {
        padding-left: 22px;
        padding-right: 22px;
      }

      .site-header {
        grid-template-columns: auto 1fr;
      }

      .search {
        grid-column: 1 / -1;
      }

      .advanced,
      .search-button,
      .category {
        display: none;
      }

      .product-grid,
      .details-section {
        grid-template-columns: 1fr;
      }

      .main-image {
        min-height: 520px;
      }

      .buy-box {
        max-width: 620px;
      }
    }

    @media (max-width: 720px) {
      .top-title { display: none; }

      .site-header {
        height: auto;
        grid-template-columns: 1fr;
        gap: 12px;
        padding-top: 18px;
        padding-bottom: 18px;
      }

      .header-actions {
        justify-self: start;
      }

      .scope-strip {
        grid-template-columns: 1fr;
      }

      .page {
        padding-top: 18px;
      }

      .media-row {
        grid-template-columns: 1fr;
      }

      .thumbs {
        display: flex;
        overflow-x: auto;
        order: 2;
      }

      .main-image {
        min-height: 420px;
      }

      .under-media,
      .detail-shots {
        padding-left: 0;
      }

      .detail-shots,
      .similar-grid,
      .spec-grid {
        grid-template-columns: 1fr;
      }

      .title {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="logo"><span>e</span><span>b</span><span>a</span><span>y</span></div>
    <div class="category">Shop by<br>category</div>
    <div class="search"><div class="search-icon">Q</div><div class="search-text">Search for anything</div><div class="search-category">All Categories v</div></div>
    <button class="search-button">Search</button>
    <div class="advanced">Advanced</div>
  </header>

  <div class="promo"><span class="promo-live">LIVE</span><span>Shop live events</span><span>Discover exclusive drops and deals</span><span class="promo-button">See what's live</span></div>

  <section class="scope-strip">
    <div class="scope-copy">
      <strong>RoadrunnerParts current 41-part review</strong>
      <span>Mockups are visual review only. Photos remain pending until operator-approved sale photos pass rights and watermark review.</span>
    </div>
    <div class="part-strip" id="partStrip"></div>
  </section>

  <main class="page">
    <section class="product-grid">
      <div class="media-column">
        <div class="media-row">
          <div class="thumbs" id="thumbs"></div>
          <div class="main-image" id="mainImage"></div>
        </div>
        <div class="under-media">
          <span>Have one to sell?</span>
          <div class="sell-buttons">
            <button class="sell-pill">Sell one like this</button>
            <button class="sell-pill">Sell something else</button>
          </div>
          <div class="link-action">Share</div>
        </div>

      </div>

      <aside class="buy-box">
        <h1 class="title" id="title"></h1>
        <div class="seller">
          <div class="seller-avatar">R</div>
          <div>
            <div class="seller-name">RoadRunnerParts</div>
            <div class="seller-meta">99.2% positive - Seller's other items</div>
          </div>
          <button class="sell-pill" style="margin-left:auto;height:36px;">Message</button>
        </div>

        <div class="price" id="price"></div>
        <div class="pay-later" id="payLater"></div>

        <div class="row"><span>Condition:</span><strong>Used</strong></div>
        <div class="row"><span>Quantity:</span><div class="qty-control"><span>-</span><span>1</span><span>+</span></div></div>

        <div class="button-stack">
          <button class="cta primary">Buy It Now</button>
          <button class="cta">Add to cart</button>
          <button class="cta muted">Add to Watchlist</button>
        </div>

        <div class="service">
          <strong>Additional service available</strong>
          <label class="checkline"><input type="checkbox"> 3-year protection plan from Allstate - review before listing</label>
        </div>

        <div class="policy-list">
          <div class="policy"><div class="policy-icon">R</div><div><strong>Breathe easy. Returns accepted.</strong></div></div>
          <div class="policy"><div class="policy-icon">S</div><div><strong>Shipping, returns, and payments</strong>Free Standard Shipping. Final shipping class requires packed weight and dimensions.</div></div>
          <div class="policy"><div class="policy-icon">L</div><div><strong>Located in</strong>United States</div></div>
          <div class="policy"><div class="policy-icon">30</div><div><strong>Returns</strong>30 days returns. Buyer pays for return shipping.</div></div>
        </div>
      </aside>
    </section>

    <section class="details-section">
      <div class="description-panel">
        <h2>About this item</h2>
        <p id="description"></p>
        <div class="spec-grid" id="specGrid"></div>
      </div>
      <div class="photo-checklist">
        <h3>Photo checklist</h3>
        <ul id="photoChecklist"></ul>
      </div>
    </section>

    <section class="similar">
      <div class="similar-head">
        <h2>Similar Items</h2>
        <a href="#">See all</a>
      </div>
      <div class="similar-grid" id="similarGrid"></div>
    </section>


  </main>

  <script>
    const listings = ${dataJson};
    let activeIndex = 0;
    let activePhotoIndex = 0;

    const partStrip = document.getElementById("partStrip");
    const thumbs = document.getElementById("thumbs");
    const mainImage = document.getElementById("mainImage");

    const title = document.getElementById("title");
    const price = document.getElementById("price");
    const payLater = document.getElementById("payLater");
    const description = document.getElementById("description");
    const specGrid = document.getElementById("specGrid");
    const photoChecklist = document.getElementById("photoChecklist");
    const similarGrid = document.getElementById("similarGrid");

    function money(value) {
      return "$" + Number(value || 0).toFixed(2);
    }

    function escapeText(value) {
      return String(value ?? "");
    }

    function renderStrip() {
      partStrip.innerHTML = listings.map((listing, index) => (
        '<button class="part-pill ' + (index === activeIndex ? 'active' : '') + '" onclick="showListing(' + index + ')">' +
        listing.partNumber +
        '</button>'
      )).join("");
    }

    function renderThumbs(listing) {
      if (listing.hasPhoto) {
        thumbs.innerHTML = listing.imageFiles.slice(0, 6).map((url, index) => (
          '<button class="thumb ' + (index === 0 ? 'active' : '') + '" onclick="setMainPhoto(' + activeIndex + ', ' + index + ', this)"><img src="' + url + '" alt="' + listing.partNumber + ' photo ' + (index + 1) + '"></button>'
        )).join("");
        return;
      }
      const labels = ["Main", "Back", "Label", "Wear"];
      thumbs.innerHTML = labels.map((label, index) => (
        '<button class="thumb ' + (index === 0 ? 'active' : '') + '">Thumb<br>' + (index + 1) + '</button>'
      )).join("");
    }

    function setMainPhoto(index, imageIndex, thumbButton) {
      const listing = listings[index];
      if (!listing.hasPhoto) return;
      activePhotoIndex = imageIndex;
      const imageUrl = listing.imageFiles[imageIndex] || listing.approvedImage;
      mainImage.innerHTML = '<button class="media-float float-expand">+</button><button class="media-float float-heart">H</button><button class="media-float float-prev" onclick="prevPhoto()">&lt;</button><button class="media-float float-next" onclick="nextPhoto()">&gt;</button><img src="' + imageUrl + '" alt="' + listing.title + '">';
      document.querySelectorAll(".thumb").forEach((thumb, i) => {
        thumb.classList.toggle("active", i === imageIndex);
      });
    }

    function prevPhoto() {
      const listing = listings[activeIndex];
      if (!listing.hasPhoto || listing.imageFiles.length < 2) return;
      const newIndex = (activePhotoIndex - 1 + listing.imageFiles.length) % listing.imageFiles.length;
      setMainPhoto(activeIndex, newIndex);
    }

    function nextPhoto() {
      const listing = listings[activeIndex];
      if (!listing.hasPhoto || listing.imageFiles.length < 2) return;
      const newIndex = (activePhotoIndex + 1) % listing.imageFiles.length;
      setMainPhoto(activeIndex, newIndex);
    }

    function renderMainImage(listing) {
      activePhotoIndex = 0;
      if (listing.hasPhoto) {
        mainImage.innerHTML = '<button class="media-float float-expand">+</button><button class="media-float float-heart">H</button><button class="media-float float-prev" onclick="prevPhoto()">&lt;</button><button class="media-float float-next" onclick="nextPhoto()">&gt;</button><img src="' + listing.approvedImage + '" alt="' + listing.title + '">';
        return;
      }

      mainImage.innerHTML =
        '<button class="media-float float-expand">+</button><button class="media-float float-heart">H</button><button class="media-float float-prev">&lt;</button><button class="media-float float-next">&gt;</button>' +
        '<div class="photo-pending">' +
          '<div>' +
            '<div class="photo-icon">+</div>' +
            '<h2>Photo pending</h2>' +
            '<p>' + listing.partNumber + ' needs operator-approved sale photos before this listing is stage-ready. Use clear product photos only; no scraped, watermarked, or rights-unclear images.</p>' +
          '</div>' +
        '</div>';
    }

    function renderDetails(listing) {

      specGrid.innerHTML = [
        ["Part number", listing.partNumber],
        ["Diagram ID", listing.diagramId || "Pending"],
        ["Category", listing.category],
        ["Supersedes", listing.supersedes || "None listed"],
        ["Brand", "GE / Hotpoint family"],
        ["Condition", "Used - inspect before listing"]
      ].map(([label, value]) => (
        '<div class="spec"><span>' + label + '</span><strong>' + value + '</strong></div>'
      )).join("");

      photoChecklist.innerHTML = listing.photoPlan.map((item) => (
        '<li><span class="status-dot ' + (listing.hasPhoto ? 'ready' : '') + '"></span><span>' + item + '</span></li>'
      )).join("");
    }

    function renderSimilar() {
      const related = listings
        .filter((_, index) => index !== activeIndex)
        .slice(activeIndex + 1)
        .concat(listings)
        .filter((_, index, array) => array.findIndex((item) => item.partNumber === _.partNumber) === index)
        .slice(0, 5);

      const tags = ["Top Rated", "Best Seller", "Hot Item", "New", "Popular"];
      const colors = ["#3665f3", "#f5af02", "#ff334d", "#10b981", "#9333ea"];

      similarGrid.innerHTML = related.map((listing, index) => (
        '<article class="similar-card" onclick="showListing(' + listings.findIndex((item) => item.partNumber === listing.partNumber) + ')">' +
          '<div class="similar-tag" style="background:' + colors[index] + '">' + tags[index] + '</div>' +
          '<div class="similar-body">' +
            '<div>' + listing.partNumber + ' ' + listing.displayDescription + '</div>' +
            '<div class="similar-price">' + money(listing.price) + '</div>' +
          '</div>' +
        '</article>'
      )).join("");
    }

    function showListing(index) {
      activeIndex = index;
      const listing = listings[index];
      renderStrip();
      renderThumbs(listing);
      renderMainImage(listing);

      title.textContent = listing.title;
      price.textContent = "US " + money(listing.price);
      payLater.textContent = "as low as " + money(listing.price / 4) + "/mo with Klarna. Learn more";
      description.textContent = listing.displayDescription + " removed from a GE/Hotpoint-family dryer. Verify fitment, cosmetic condition, and test status before publishing. Price shown is the current operator CSV input for this pass.";

      renderDetails(listing);
      renderSimilar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    showListing(0);
  </script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);
fs.writeFileSync(
  coverageOutputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scopePath,
      outputPath,
      publicGalleryPath,
      publicImageDir,
      totalParts: parts.length,
      localImagesAttached: partsWithImages,
      missingCount: missingImages.length,
      missingParts: parts
        .filter((part) => !part.hasPhoto)
        .map((part) => ({
          partNumber: part.partNumber,
          diagramId: part.diagramId,
          description: part.description,
        })),
      attachedParts: parts
        .filter((part) => part.hasPhoto)
        .map((part) => ({
          partNumber: part.partNumber,
          imageCount: part.imageFiles.length,
          primaryImage: part.imageSourcePath,
          publicPrimaryImage: part.publicImageUrl,
          publicPrimaryImagePath: part.publicImagePath,
        })),
    },
    null,
    2,
  ),
);
console.log(`Wrote ${outputPath} with ${parts.length} current-scope mockups.`);
console.log(`Public gallery path: ${publicGalleryPath}`);
console.log(`Wrote ${coverageOutputPath}.`);
console.log(`Live image routes attached: ${partsWithImages}/${parts.length}. Missing: ${missingImages.join(", ")}`);
