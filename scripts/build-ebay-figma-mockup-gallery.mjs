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
const descriptionEvidencePath = "scratch/description-evidence/reliableparts-descriptions - Copy.json";
const frontendEditsPath = "scratch/frontend-ebay-edits/current-live-edits.json";
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

function resetPublicImageDir() {
  const resolved = path.resolve(publicImageDir);
  const expected = path.resolve("public", "ebay-current-images");
  if (resolved !== expected) {
    throw new Error(`Refusing to reset unexpected image output directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
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

function saleImagesForPart(partNumber) {
  return localImagesForPart(partNumber).filter((filePath) =>
    filePath.replaceAll("\\", "/").toLowerCase().includes("/approved-images/"),
  );
}

function loadDescriptionEvidence() {
  try {
    const raw = JSON.parse(fs.readFileSync(descriptionEvidencePath, "utf8"));
    const descs = Array.isArray(raw.descriptions) ? raw.descriptions : [];
    const map = new Map();
    for (const entry of descs) {
      const pn = String(entry.partNumber || "").trim().toUpperCase();
      if (pn) {
        map.set(pn, {
          descriptionText: String(entry.descriptionText || "").trim(),
          sku: String(entry.sku || "").trim(),
        });
      }
    }
    console.log(`Loaded ${map.size} description(s) from evidence file.`);
    return map;
  } catch (err) {
    console.warn(`Could not load description evidence: ${err.message}`);
    return new Map();
  }
}

const descriptionMap = loadDescriptionEvidence();

function loadFrontendEdits() {
  try {
    const raw = JSON.parse(fs.readFileSync(frontendEditsPath, "utf8"));
    const edits = Array.isArray(raw.edits) ? raw.edits : [];
    const map = new Map();
    for (const edit of edits) {
      const pn = String(edit.partNumber || "").trim().toUpperCase();
      if (pn) map.set(pn, edit);
    }
    console.log(`Loaded ${map.size} frontend edit(s) from ${frontendEditsPath}.`);
    return map;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`Could not load frontend edits: ${err.message}`);
    }
    return new Map();
  }
}

function editString(edit, key, fallback) {
  const value = edit && typeof edit[key] === "string" ? edit[key].trim() : "";
  return value || fallback;
}

function editNumber(edit, key, fallback) {
  const value = Number(edit?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

const frontendEditMap = loadFrontendEdits();

function readParts() {
  const parsed = JSON.parse(fs.readFileSync(scopePath, "utf8"));
  const rows = Array.isArray(parsed.parts) ? parsed.parts : [];
  return rows.map((row, index) => {
    const partNumber = String(row.partNumber || "").trim().toUpperCase();
    const referenceImageFiles = localImagesForPart(partNumber);
    const imageFiles = saleImagesForPart(partNumber);
    const publicImages = imageFiles.map((filePath) => ({
      sourcePath: filePath,
      ...copyImageToPublic(filePath),
    }));
    const approvedImage = publicImages[0]?.url || "";
    const description = String(row.description || "Appliance Part").trim();
    const category = partCategory(description);
    const evidence = descriptionMap.get(partNumber) || {};
    const evidenceDescription = evidence.descriptionText || "";
    const frontendEdit = frontendEditMap.get(partNumber) || {};
    const priceValue = editNumber(frontendEdit, "price", Number(row.price || 0));
    const quantityValue = Math.max(1, editNumber(frontendEdit, "quantity", 1));
    const displayPartNumber = editString(frontendEdit, "displayPartNumber", evidence.sku || partNumber);
    const title = editString(frontendEdit, "title", `GE ${partNumber} ${titleCase(description)} Used Dryer Part`);
    const descriptionText = editString(frontendEdit, "descriptionText", evidenceDescription);
    return {
      index,
      partNumber,
      diagramId: String(row.diagramId || row["diagram id"] || "").trim(),
      description,
      displayDescription: titleCase(description),
      descriptionText,
      category,
      supersedes: String(row.supersedes || "").trim(),
      price: priceValue,
      priceLabel: dollars(priceValue),
      title,
      condition: editString(frontendEdit, "condition", "Used"),
      quantity: quantityValue,
      displayPartNumber,
      fitmentLinkText: editString(frontendEdit, "fitmentLinkText", "Does this part fit my appliance?"),
      reviewLinkText: editString(frontendEdit, "reviewLinkText", "Be the first to review this product"),
      location: editString(frontendEdit, "location", "United States"),
      shipping: editString(frontendEdit, "shipping", "Free Standard Shipping"),
      returns: editString(frontendEdit, "returns", "30 days returns. Buyer pays return shipping."),
      brand: editString(frontendEdit, "brand", "GE / Hotpoint family"),
      mpn: editString(frontendEdit, "mpn", partNumber),
      fitment: editString(frontendEdit, "fitment", "Verify model compatibility before purchase"),
      sellerNotes: editString(frontendEdit, "sellerNotes", ""),
      protection: Boolean(frontendEdit.protection),
      approvedImage,
      imageFiles: publicImages.map((image) => image.url),
      imageSourcePath: imageFiles[0] || "",
      publicImagePath: publicImages[0]?.filePath || "",
      publicImageUrl: publicImages[0]?.url || "",
      hasPhoto: Boolean(approvedImage),
      referenceImageCount: referenceImageFiles.length,
      heldReferenceImageCount: Math.max(0, referenceImageFiles.length - imageFiles.length),
      photoGate: approvedImage ? "operator_sale_photo_ready" : "operator_sale_photo_required",
      photoPlan: photoPlan(description),
    };
  });
}

resetPublicImageDir();
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

    .search-input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      color: #111820;
      font: inherit;
      font-size: 15px;
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
      cursor: pointer;
    }

    .advanced {
      border: 0;
      background: transparent;
      color: #5f6b7a;
      font-size: 12px;
      cursor: pointer;
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
      border: 0;
      background: white;
      color: #421bc8;
      border-radius: 999px;
      padding: 9px 20px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
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
      max-width: none;
      margin: 0;
      padding: 0 0 64px;
    }

    .editor-frame {
      max-width: 1880px;
      margin: 0 auto;
      padding: 0 18px 64px;
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }

    .layer-panel {
      position: sticky;
      top: 18px;
      max-height: calc(100vh - 36px);
      overflow: auto;
      border: 1px solid #d6dce7;
      border-radius: 12px;
      background: #f8fafc;
      padding: 12px;
      box-shadow: 0 14px 38px rgba(17, 24, 39, 0.06);
    }

    .layer-panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 6px 4px 10px;
    }

    .layer-panel-head strong {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .layer-panel-head span {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      font-weight: 800;
    }

    .layer-list {
      display: grid;
      gap: 4px;
      margin-bottom: 14px;
    }

    .layer-item {
      width: 100%;
      min-height: 36px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: #273445;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 8px;
      font-size: 12px;
      font-weight: 780;
      text-align: left;
      cursor: pointer;
    }

    .layer-item:hover {
      background: #eef3ff;
      border-color: #d6e1ff;
    }

    .layer-item.active {
      background: #eaf0ff;
      border-color: var(--blue);
      color: var(--blue);
      box-shadow: 0 0 0 1px rgba(54, 101, 243, 0.08);
    }

    .layer-icon {
      width: 20px;
      height: 20px;
      border: 1px solid #cfd7e6;
      border-radius: 5px;
      background: white;
      color: #64748b;
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 900;
      flex: 0 0 auto;
    }

    .layer-item.active .layer-icon {
      border-color: var(--blue);
      color: var(--blue);
    }

    .canvas-area {
      min-width: 0;
    }

    .canvas-highlight {
      outline: 2px solid var(--blue);
      outline-offset: 6px;
      border-radius: 12px;
      transition: outline-color 0.2s;
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
      cursor: pointer;
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
      cursor: pointer;
    }

    .link-action {
      border: 0;
      background: transparent;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #2f3a49;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }

    .toast {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 30;
      max-width: min(360px, calc(100vw - 44px));
      border: 1px solid #d6dce7;
      border-radius: 10px;
      background: #111820;
      color: white;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 750;
      box-shadow: 0 16px 44px rgba(17, 24, 39, 0.22);
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: opacity 0.18s, transform 0.18s;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }





    .buy-box {
      padding-top: 4px;
    }

    @media (min-width: 980px) {
      .buy-box {
        position: sticky;
        top: 18px;
        align-self: start;
      }
    }

    .title {
      border: 2px solid transparent;
      border-radius: 8px;
      font-size: 24px;
      line-height: 1.22;
      letter-spacing: 0;
      margin: 0 0 16px;
      font-weight: 780;
      padding: 4px;
    }

    .title:focus {
      outline: none;
      border-color: var(--blue);
      background: #f8fbff;
    }

    .operator-actions {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin: 28px 0 16px;
    }

    .operator-actions button {
      height: 36px;
      border: 1px solid #d6dce7;
      border-radius: 999px;
      background: #fff;
      color: #2f3a49;
      font-size: 11px;
      font-weight: 850;
      cursor: pointer;
    }

    .operator-actions button:first-child {
      border-color: var(--blue);
      color: var(--blue);
    }

    .text-editor {
      border: 1px solid #d6dce7;
      border-radius: 12px;
      background: #f8fafc;
      padding: 14px;
      margin: 0 0 18px;
    }

    .image-editor {
      border: 1px solid #d6dce7;
      border-radius: 12px;
      background: #fff;
      padding: 14px;
      margin: 0 0 18px;
    }

    .ai-editor {
      border: 1px solid #c7d2fe;
      border-radius: 12px;
      background: #f8fbff;
      padding: 14px;
      margin: 0 0 18px;
    }

    .text-editor-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .text-editor-head strong {
      font-size: 14px;
    }

    .text-editor-head span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .editor-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .editor-field {
      display: grid;
      gap: 5px;
      color: #475569;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .editor-field input,
    .editor-field textarea {
      width: 100%;
      min-width: 0;
      border: 1px solid #cfd7e6;
      border-radius: 8px;
      background: white;
      color: #111820;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.45;
      padding: 9px 10px;
      text-transform: none;
      letter-spacing: 0;
    }

    .editor-field textarea {
      resize: vertical;
    }

    .editor-field.full {
      grid-column: 1 / -1;
    }

    .editor-field input:focus,
    .editor-field textarea:focus {
      outline: none;
      border-color: var(--blue);
      box-shadow: 0 0 0 2px rgba(54, 101, 243, 0.12);
    }

    .image-upload-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .image-upload-row input {
      width: 100%;
      border: 1px dashed #cfd7e6;
      border-radius: 8px;
      background: #f8fafc;
      padding: 9px;
      font-size: 12px;
      font-weight: 750;
    }

    .image-upload-row button {
      height: 38px;
      border: 1px solid #d6dce7;
      border-radius: 999px;
      background: #fff;
      color: #2f3a49;
      font-size: 11px;
      font-weight: 850;
      cursor: pointer;
      padding: 0 12px;
      white-space: nowrap;
    }

    .image-upload-meta {
      min-height: 18px;
      margin-top: 9px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 700;
    }

    .ai-editor textarea {
      width: 100%;
      min-height: 92px;
      border: 1px solid #b9c7fb;
      border-radius: 8px;
      background: white;
      color: #111820;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.45;
      padding: 10px;
      resize: vertical;
    }

    .ai-editor textarea:focus {
      outline: none;
      border-color: var(--blue);
      box-shadow: 0 0 0 2px rgba(54, 101, 243, 0.12);
    }

    .ai-model-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 0 0 10px;
    }

    .ai-model-grid label {
      display: grid;
      gap: 4px;
      color: #415066;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .ai-model-grid select,
    .ai-model-grid input {
      width: 100%;
      height: 36px;
      border: 1px solid #b9c7fb;
      border-radius: 8px;
      background: white;
      color: #111820;
      font: inherit;
      font-size: 12px;
      font-weight: 750;
      padding: 0 10px;
    }

    .ai-model-grid select:focus,
    .ai-model-grid input:focus {
      outline: none;
      border-color: var(--blue);
      box-shadow: 0 0 0 2px rgba(54, 101, 243, 0.12);
    }

    .ai-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }

    .ai-actions button {
      height: 36px;
      border: 1px solid var(--blue);
      border-radius: 999px;
      background: var(--blue);
      color: white;
      padding: 0 14px;
      font-size: 11px;
      font-weight: 850;
      cursor: pointer;
    }

    .ai-actions button.secondary {
      background: white;
      color: var(--blue);
    }

    .ai-status {
      min-height: 18px;
      margin-top: 8px;
      color: #475569;
      font-size: 12px;
      font-weight: 750;
      line-height: 1.35;
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
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .price-input {
      font-size: 28px;
      font-weight: 820;
      font-family: inherit;
      border: 2px solid transparent;
      border-radius: 8px;
      background: transparent;
      padding: 2px 6px;
      width: 140px;
      color: var(--text);
      transition: border-color 0.15s, background 0.15s;
    }

    .price-input:hover {
      border-color: var(--line);
      background: var(--soft);
    }

    .price-input:focus {
      outline: none;
      border-color: var(--blue);
      background: white;
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
      grid-template-columns: 44px 1fr 44px;
      border: 1px solid #d9dee7;
      border-radius: 6px;
      overflow: hidden;
      height: 48px;
      width: 172px;
      color: #172033;
    }

    .qty-control button,
    .qty-control span {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qty-control button {
      border: 0;
      background: #f8fafc;
      color: #111820;
      font-size: 18px;
      font-weight: 850;
      cursor: pointer;
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

    .listing-alert {
      margin: 16px 0 0;
      border: 1px solid #f0d48a;
      border-radius: 10px;
      background: #fff8e6;
      color: #6b4a00;
      padding: 12px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.45;
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

    .item-specifics { margin-top: 46px; border-top: 1px solid var(--line); padding-top: 26px; }
    .item-specifics h2, .description-section h2, .tab-section h2, .similar h2 { margin: 0 0 18px; font-size: 22px; font-weight: 780; }
    .specifics-table { width: 100%; border-collapse: collapse; max-width: 900px; }
    .specifics-table td { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    .specifics-table td:first-child { color: var(--muted); width: 200px; }
    .specifics-table td:last-child { color: var(--text); font-weight: 600; }
    .specifics-table input { width: 100%; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #111820; font: inherit; font-weight: 700; padding: 3px 6px; }
    .specifics-table input:hover { border-color: var(--line); background: var(--soft); }
    .specifics-table input:focus { outline: none; border-color: var(--blue); background: white; }

    .description-section { margin-top: 32px; border-top: 1px solid var(--line); padding-top: 26px; }
    .description-preview { max-width: 1040px; margin-bottom: 18px; color: #555f6d; font-size: 18px; line-height: 1.62; }
    .description-meta { font-size: 17px; margin-bottom: 20px; color: #555f6d; }
    .description-meta strong { color: #555f6d; }
    .description-link { border: 0; background: transparent; color: #0654ba; font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
    .description-review { display: inline-flex; margin-bottom: 28px; }
    .description-body { margin: 0; max-height: 185px; overflow: hidden; }
    .description-body.expanded { max-height: none; }
    .read-toggle { margin-top: 4px; color: #0654ba; }
    .description-edit { width: 100%; min-height: 120px; border: 1px solid var(--line); border-radius: 10px; color: #334155; font: inherit; font-size: 14px; line-height: 1.65; padding: 16px; resize: vertical; max-width: 900px; }
    .description-edit:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 2px rgba(54, 101, 243, 0.12); }

    .tab-section { margin-top: 32px; border-top: 1px solid var(--line); padding-top: 26px; }
    .tab-nav { display: flex; border-bottom: 2px solid var(--line); }
    .tab-btn { padding: 12px 28px; font-size: 15px; font-weight: 700; color: var(--muted); border: none; background: none; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--text); border-bottom-color: var(--text); }
    .tab-panel { display: none; padding: 20px 0; }
    .tab-panel.active { display: block; }
    .info-table { width: 100%; border-collapse: collapse; max-width: 900px; }
    .info-table td { padding: 11px 16px; border-bottom: 1px solid var(--line); font-size: 14px; }
    .info-table td:first-child { color: var(--muted); width: 200px; }

    .ebay-footer { margin-top: 48px; border-top: 1px solid var(--line); padding: 32px 0 80px; max-width: 1618px; margin-left: auto; margin-right: auto; }
    .footer-links { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
    .footer-links a { color: var(--muted); font-size: 12px; text-decoration: none; }
    .footer-links a:hover { text-decoration: underline; }
    .footer-copyright { text-align: center; color: var(--muted); font-size: 11px; }

    .save-bar { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid var(--line); padding: 10px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 100; box-shadow: 0 -4px 16px rgba(0,0,0,0.06); }
    .save-info { font-size: 13px; color: var(--muted); }
    .save-info strong { color: var(--text); }
    .save-actions { display: flex; gap: 10px; }
    .save-btn { height: 40px; padding: 0 22px; border-radius: 20px; font-weight: 700; font-size: 13px; cursor: pointer; border: 1px solid var(--line); background: white; color: var(--text); }
    .save-btn:hover { background: var(--soft); }
    .save-btn.primary { background: var(--blue); color: white; border-color: var(--blue); }
    .save-btn.primary:hover { background: var(--blue-dark); }

    .fullscreen-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 200; place-items: center; cursor: zoom-out; }
    .fullscreen-overlay.open { display: grid; }
    .fullscreen-overlay img { max-width: 92vw; max-height: 92vh; object-fit: contain; }
    .fullscreen-close { position: absolute; top: 20px; right: 24px; width: 44px; height: 44px; border-radius: 50%; border: none; background: white; font-size: 22px; cursor: pointer; display: grid; place-items: center; }

    .similar { margin-top: 40px; border-top: 1px solid var(--line); padding-top: 26px; }
    .similar-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .similar-head a { color: var(--blue); text-decoration: none; font-weight: 700; font-size: 13px; }
    .similar-grid { display: grid; grid-template-columns: repeat(5, minmax(160px, 1fr)); gap: 16px; }
    .similar-card { border: 1px solid var(--line); border-radius: 12px; background: white; overflow: hidden; cursor: pointer; }

    .similar-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .similar-img { height: 140px; background: #f5f5f5; display: grid; place-items: center; overflow: hidden; }
    .similar-img img { width: 100%; height: 100%; object-fit: contain; }
    .similar-body {
      padding: 10px 12px 12px;
      color: #253044;
      font-size: 13px;
      font-weight: 650;
    }

    .similar-image {
      height: 158px;
      display: grid;
      place-items: center;
      background: #fff;
      border-bottom: 1px solid var(--line);
    }

    .similar-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 10px;
    }

    .similar-image span {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 850;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .similar-price { color: #111820; margin-top: 6px; font-weight: 800; font-size: 15px; }
    .similar-shipping { color: var(--muted); font-size: 12px; margin-top: 2px; }

    @media (max-width: 1100px) {
      .site-header,
      .scope-strip {
        padding-left: 22px;
        padding-right: 22px;
      }

      .editor-frame {
        grid-template-columns: 1fr;
        padding-left: 22px;
        padding-right: 22px;
      }

      .layer-panel {
        position: static;
        max-height: none;
      }

      .layer-list {
        grid-template-columns: repeat(4, minmax(0, 1fr));
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

      .editor-frame {
        padding-left: 12px;
        padding-right: 12px;
      }

      .layer-list {
        display: flex;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .layer-item {
        min-width: 132px;
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

      .under-media {
        padding-left: 0;
      }

      .similar-grid {
        grid-template-columns: repeat(3, 1fr);
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
    <div class="search"><div class="search-icon">Q</div><input class="search-input" id="searchInput" value="GE dryer parts"><div class="search-category">All Categories v</div></div>
    <button class="search-button" id="searchBtn">Search</button>
    <button class="advanced" id="advancedBtn">Advanced</button>
  </header>

  <div class="promo"><span class="promo-live">LIVE</span><span>Shop live events</span><span>Discover exclusive drops and deals</span><button class="promo-button" id="liveBtn">See what's live</button></div>


  <div class="editor-frame">
    <aside class="layer-panel" aria-label="Frontend editor layers">
      <div class="layer-panel-head">
        <strong>Layers</strong>
        <span id="layerPartLabel"></span>
      </div>
      <div class="layer-list" id="layerList">
        <button class="layer-item active" data-layer-target=".media-row" data-layer-name="Gallery"><span class="layer-icon">G</span><span>Gallery</span></button>
        <button class="layer-item" data-layer-target=".buy-box" data-layer-name="Buy box"><span class="layer-icon">B</span><span>Buy box</span></button>
        <button class="layer-item" data-layer-target=".item-specifics" data-layer-name="Specifics"><span class="layer-icon">S</span><span>Specifics</span></button>
        <button class="layer-item" data-layer-target=".description-section" data-layer-name="Description"><span class="layer-icon">D</span><span>Description</span></button>
        <button class="layer-item" data-layer-target=".tab-section" data-layer-name="Shipping"><span class="layer-icon">T</span><span>Shipping</span></button>
        <button class="layer-item" data-layer-target=".similar" data-layer-name="Similar"><span class="layer-icon">R</span><span>Similar</span></button>
      </div>
      <div class="layer-panel-head">
        <strong>Properties</strong>
        <span>Edit</span>
      </div>
      <div class="layer-list">
        <button class="layer-item" data-editor-target="imageEditor"><span class="layer-icon">I</span><span>Images</span></button>
        <button class="layer-item" data-editor-target="aiEditor"><span class="layer-icon">AI</span><span>AI adjust</span></button>
        <button class="layer-item" data-editor-target="textEditor"><span class="layer-icon">P</span><span>Text fields</span></button>
        <button class="layer-item" data-editor-target="specificsTable"><span class="layer-icon">#</span><span>Item fields</span></button>
      </div>
    </aside>

    <div class="canvas-area">
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
            <button class="sell-pill" data-action="sell-like">Sell one like this</button>
            <button class="sell-pill" data-action="sell-other">Sell something else</button>
          </div>
          <button class="link-action" data-action="share">Share</button>
        </div>

        <section class="scope-strip">
          <div class="scope-copy">
            <strong>RoadrunnerParts current 41-part review</strong>
            <span>Mockups are visual review only. Photos remain pending until operator-approved sale photos pass rights and watermark review.</span>
          </div>
          <div class="part-strip" id="partStrip"></div>
        </section>
      </div>

      <aside class="buy-box">
        <h1 class="title" id="title"></h1>
        <div class="seller">
          <div class="seller-avatar">R</div>
          <div>
            <div class="seller-name">RoadRunnerParts</div>
            <div class="seller-meta">99.2% positive - Seller's other items</div>
          </div>
          <button class="sell-pill" data-action="message" style="margin-left:auto;height:36px;">Message</button>
        </div>

        <div class="price" id="price">US <input type="text" class="price-input" id="priceInput"></div>
        <div class="pay-later" id="payLater"></div>

        <div class="row"><span>Condition:</span><strong id="conditionText">Used</strong></div>
        <div class="row"><span>Quantity:</span><div class="qty-control"><button data-action="qty-down">-</button><span id="qtyValue">1</span><button data-action="qty-up">+</button></div></div>

        <div class="button-stack">
          <button class="cta primary" data-action="buy-now">Buy It Now</button>
          <button class="cta" data-action="cart">Add to cart</button>
          <button class="cta muted" data-action="watch">Add to Watchlist</button>
        </div>

        <div class="service">
          <strong>Additional service available</strong>
          <label class="checkline"><input type="checkbox" id="protectionInput"> 3-year protection plan from Allstate - review before listing</label>
        </div>
        <div class="listing-alert" id="listingAlert"></div>

        <div class="policy-list">
          <div class="policy"><div class="policy-icon">R</div><div><strong>Breathe easy. Returns accepted.</strong></div></div>
          <div class="policy"><div class="policy-icon">S</div><div><strong>Shipping, returns, and payments</strong>Free Standard Shipping. Final shipping class requires packed weight and dimensions.</div></div>
          <div class="policy"><div class="policy-icon">L</div><div><strong>Located in</strong>United States</div></div>
          <div class="policy"><div class="policy-icon">30</div><div><strong>Returns</strong>30 days returns. Buyer pays for return shipping.</div></div>
        </div>

        <div class="operator-actions">
          <button data-action="save">Save</button>
          <button data-action="reset">Reset</button>
          <button data-action="copy">Copy</button>
          <button data-action="export">Export</button>
          <button data-action="publish">Publish</button>
          <button data-action="commit">Commit</button>
        </div>
        <div class="image-editor" id="imageEditor">
          <div class="text-editor-head">
            <strong>Listing image editor</strong>
            <span>Live preview</span>
          </div>
          <div class="image-upload-row">
            <input type="file" id="imageUpload" accept="image/jpeg,image/png,image/webp,image/avif">
            <button type="button" data-action="clear-upload">Clear image</button>
          </div>
          <div class="image-upload-meta" id="imageUploadMeta"></div>
        </div>
        <div class="ai-editor" id="aiEditor">
          <div class="text-editor-head">
            <strong>AI adjust</strong>
            <span>Gemini</span>
          </div>
          <div class="ai-model-grid">
            <label>Model preset
              <select id="aiModelPreset">
                <option value="gemini-3.1-flash-lite">3.1 Flash Lite</option>
                <option value="gemini-3-flash-preview">3 Flash Preview</option>
                <option value="gemini-3.1-pro-preview">3.1 Pro Preview</option>
                <option value="gemini-2.5-pro">2.5 Pro</option>
                <option value="gemini-2.5-flash">2.5 Flash</option>
                <option value="gemini-3.1-flash-image-preview">Nano Banana 2 / Image workflow only</option>
                <option value="custom">Custom Gemini ID</option>
              </select>
            </label>
            <label>Model ID
              <input id="aiModelId" value="gemini-3.1-flash-lite" spellcheck="false">
            </label>
          </div>
          <textarea id="aiPrompt" spellcheck="true">Rewrite the description to sound more natural for a used appliance part without adding unsupported claims.</textarea>
          <div class="ai-actions">
            <button type="button" data-action="ai-apply">Apply AI edit</button>
            <button type="button" class="secondary" data-action="ai-description">Description only</button>
          </div>
          <div class="ai-status" id="aiStatus"></div>
        </div>
        <div class="text-editor" id="textEditor">
          <div class="text-editor-head">
            <strong>Listing text editor</strong>
            <span>Live preview</span>
          </div>
          <div class="editor-grid">
            <label class="editor-field full">Title<textarea id="editTitle" data-edit-key="title" rows="3" spellcheck="true"></textarea></label>
            <label class="editor-field">Display part #<input id="editDisplayPartNumber" data-edit-key="displayPartNumber"></label>
            <label class="editor-field">Fitment link<input id="editFitmentLinkText" data-edit-key="fitmentLinkText"></label>
            <label class="editor-field full">Review link<input id="editReviewLinkText" data-edit-key="reviewLinkText"></label>
            <label class="editor-field">Price<input id="editPrice" data-edit-key="price" inputmode="decimal"></label>
            <label class="editor-field">Quantity<input id="editQuantity" data-edit-key="quantity" inputmode="numeric"></label>
            <label class="editor-field">Condition<input id="editCondition" data-edit-key="condition"></label>
            <label class="editor-field">Brand<input id="editBrand" data-edit-key="brand"></label>
            <label class="editor-field">MPN<input id="editMpn" data-edit-key="mpn"></label>
            <label class="editor-field">Fitment<input id="editFitment" data-edit-key="fitment"></label>
            <label class="editor-field">Ships from<input id="editLocation" data-edit-key="location"></label>
            <label class="editor-field">Shipping<input id="editShipping" data-edit-key="shipping"></label>
            <label class="editor-field full">Returns<input id="editReturns" data-edit-key="returns"></label>
            <label class="editor-field full">Description<textarea id="editDescription" data-edit-key="descriptionText" rows="6" spellcheck="true"></textarea></label>
            <label class="editor-field full">Seller notes<textarea id="editSellerNotes" data-edit-key="sellerNotes" rows="4" spellcheck="true"></textarea></label>
          </div>
        </div>
      </aside>
    </section>

    <section class="item-specifics">
      <h2>Item specifics</h2>
      <table class="specifics-table" id="specificsTable"></table>
    </section>

    <section class="description-section">
      <h2>Item description from the seller</h2>
      <div class="description-preview">
        <div class="description-meta"><strong>Part #: <span id="displayPartNumberPreview"></span></strong> <span>|</span> <button class="description-link" data-action="fitment-link" id="fitmentLinkPreview"></button></div>
        <button class="description-link description-review" data-action="review-link" id="reviewLinkPreview"></button>
        <p class="description-body" id="descriptionPreview"></p>
        <button class="link-action read-toggle" data-action="read-toggle" id="readToggle">Read More</button>
      </div>
      <textarea class="description-edit" id="description"></textarea>
    </section>

    <section class="tab-section">
      <h2>Shipping, returns, and payments</h2>
      <div class="tab-nav">
        <button class="tab-btn active" data-tab="shipping">Shipping</button>
        <button class="tab-btn" data-tab="returns">Returns</button>
        <button class="tab-btn" data-tab="payments">Payments</button>
      </div>
      <div class="tab-panel active" id="tab-shipping">
        <table class="info-table">
          <tr><td>Shipping cost</td><td><strong>Free</strong> Standard Shipping</td></tr>
          <tr><td>Delivery</td><td>Estimated between 5-8 business days</td></tr>
          <tr><td>Handling time</td><td>Will usually ship within 1 business day of receiving cleared payment.</td></tr>
          <tr><td>Ships to</td><td>United States</td></tr>
          <tr><td>Excludes</td><td>Alaska/Hawaii, US Protectorates, APO/FPO, PO Box</td></tr>
        </table>
      </div>
      <div class="tab-panel" id="tab-returns">
        <table class="info-table">
          <tr><td>Return policy</td><td>30 days money back</td></tr>
          <tr><td>Return shipping</td><td>Buyer pays for return shipping</td></tr>
          <tr><td>Refund method</td><td>Money back or replacement (buyer's choice)</td></tr>
        </table>
      </div>
      <div class="tab-panel" id="tab-payments">
        <table class="info-table">
          <tr><td>Accepted</td><td>PayPal, Visa, Mastercard, Discover, American Express</td></tr>
          <tr><td>Managed payments</td><td>This seller accepts payments through eBay's managed payments.</td></tr>
        </table>
      </div>
    </section>

    <section class="similar">
      <div class="similar-head">
        <h2>Similar sponsored items</h2>
        <button class="link-action" data-action="see-all">See all</button>
      </div>
      <div class="similar-grid" id="similarGrid"></div>
    </section>

  </main>
    </div>
  </div>

  <footer class="ebay-footer">
    <div class="footer-links">
      <a href="#">About eBay</a><a href="#">Announcements</a><a href="#">Community</a><a href="#">Security Center</a><a href="#">Seller Center</a><a href="#">Policies</a><a href="#">Affiliates</a><a href="#">Help & Contact</a><a href="#">Site Map</a>
    </div>
    <div class="footer-copyright">Copyright 1995-2025 eBay Inc. All Rights Reserved. Mockup preview only.</div>
  </footer>

  <div class="save-bar">
    <div class="save-info"><strong id="saveStatus">Editing</strong> <span id="savePartLabel"></span></div>
    <div class="save-actions">
      <button class="save-btn" onclick="resetListing()">Reset</button>
      <button class="save-btn" onclick="copyListingJSON()">Copy JSON</button>
      <button class="save-btn" onclick="exportAllJSON()">Export All</button>
      <button class="save-btn primary" onclick="saveListing()">Save Changes</button>
    </div>
  </div>

  <div class="fullscreen-overlay" id="fullscreenOverlay" onclick="closeFullscreen()">
    <button class="fullscreen-close" onclick="closeFullscreen()">&times;</button>
    <img id="fullscreenImg" src="" alt="">
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const listings = ${dataJson};
    let activeIndex = 0;
    let activePhotoIndex = 0;

    const partStrip = document.getElementById("partStrip");
    const thumbs = document.getElementById("thumbs");
    const mainImage = document.getElementById("mainImage");

    const title = document.getElementById("title");
    const price = document.getElementById("price");
    const priceInput = document.getElementById("priceInput");
    const payLater = document.getElementById("payLater");
    const description = document.getElementById("description");
    const displayPartNumberPreview = document.getElementById("displayPartNumberPreview");
    const fitmentLinkPreview = document.getElementById("fitmentLinkPreview");
    const reviewLinkPreview = document.getElementById("reviewLinkPreview");
    const descriptionPreview = document.getElementById("descriptionPreview");
    const readToggle = document.getElementById("readToggle");
    const specificsTable = document.getElementById("specificsTable");
    const similarGrid = document.getElementById("similarGrid");
    const conditionText = document.getElementById("conditionText");
    const qtyValue = document.getElementById("qtyValue");
    const listingAlert = document.getElementById("listingAlert");
    const savePartLabel = document.getElementById("savePartLabel");
    const protectionInput = document.getElementById("protectionInput");
    const toast = document.getElementById("toast");
    const editTitle = document.getElementById("editTitle");
    const editDisplayPartNumber = document.getElementById("editDisplayPartNumber");
    const editFitmentLinkText = document.getElementById("editFitmentLinkText");
    const editReviewLinkText = document.getElementById("editReviewLinkText");
    const editPrice = document.getElementById("editPrice");
    const editQuantity = document.getElementById("editQuantity");
    const editCondition = document.getElementById("editCondition");
    const editBrand = document.getElementById("editBrand");
    const editMpn = document.getElementById("editMpn");
    const editFitment = document.getElementById("editFitment");
    const editLocation = document.getElementById("editLocation");
    const editShipping = document.getElementById("editShipping");
    const editReturns = document.getElementById("editReturns");
    const editDescription = document.getElementById("editDescription");
    const editSellerNotes = document.getElementById("editSellerNotes");
    const imageUpload = document.getElementById("imageUpload");
    const imageUploadMeta = document.getElementById("imageUploadMeta");
    const aiPrompt = document.getElementById("aiPrompt");
    const aiModelPreset = document.getElementById("aiModelPreset");
    const aiModelId = document.getElementById("aiModelId");
    const aiStatus = document.getElementById("aiStatus");
    const layerPartLabel = document.getElementById("layerPartLabel");
    const layerItems = Array.from(document.querySelectorAll("[data-layer-target]"));
    const editorFields = Array.from(document.querySelectorAll("[data-edit-key]"));
    const draftStoragePrefix = "rrp-live-ebay-mockup:";
    const officeEditorSessionKey = "rrp:office-editor:gemini-session";
    const pendingImageUploads = new Map();
    let toastTimer = 0;
    let descriptionExpanded = false;

    function money(value) {
      return "$" + Number(value || 0).toFixed(2);
    }

    function escapeText(value) {
      return String(value ?? "");
    }

    function storageKey(partNumber) {
      return draftStoragePrefix + partNumber;
    }

    function formatFileSize(bytes) {
      const value = Number(bytes || 0);
      if (value > 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + " MB";
      if (value > 1024) return Math.round(value / 1024) + " KB";
      return value + " B";
    }

    function pendingImageFor(listing) {
      return pendingImageUploads.get(listing.partNumber) || null;
    }

    function imageFilesFor(listing) {
      const pending = pendingImageFor(listing);
      const existing = Array.isArray(listing.imageFiles) ? listing.imageFiles : [];
      return pending ? [pending.previewUrl, ...existing.filter((url) => url !== listing.approvedImage)] : existing;
    }

    function primaryImageFor(listing) {
      const pending = pendingImageFor(listing);
      return pending ? pending.previewUrl : listing.approvedImage;
    }

    function hasListingPhoto(listing) {
      return Boolean(primaryImageFor(listing));
    }

    function refreshImageEditor(listing) {
      imageUpload.value = "";
      const pending = pendingImageFor(listing);
      if (pending) {
        imageUploadMeta.textContent = "Selected: " + pending.name + " (" + formatFileSize(pending.size) + "). Commit to publish it.";
        return;
      }
      imageUploadMeta.textContent = listing.hasPhoto
        ? "Current approved image is attached. Choose a new file to replace the lead preview."
        : "No approved image yet. Choose an operator-owned sale photo for this listing.";
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read image file"));
        reader.readAsDataURL(file);
      });
    }

    function defaultDescription(listing) {
      if (listing.descriptionText) return listing.descriptionText;
      return "Replacement " + listing.displayDescription.toLowerCase() + " for GE/Hotpoint-family dryers. Use this text area for the customer-facing listing copy: condition notes, visible wear, included hardware, fitment limits, and any testing you performed. Verify the exact model and part number before publishing.";
    }

    function defaultNotes(listing) {
      if (listing.sellerNotes) return listing.sellerNotes;
      return listing.hasPhoto
        ? "Photo candidate attached for operator review. Confirm watermark status, rights, cosmetic condition, and bench-test notes before final staging."
        : "Photo pending. Provider/reference images are held out of the listing preview. Add operator-owned sale photos before this listing can be staged.";
    }

    function getDraft(listing) {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey(listing.partNumber)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function effectiveListing(listing) {
      const draft = getDraft(listing);
      return {
        ...listing,
        title: draft.title || listing.title,
        displayPartNumber: draft.displayPartNumber || listing.displayPartNumber,
        fitmentLinkText: draft.fitmentLinkText || listing.fitmentLinkText,
        reviewLinkText: draft.reviewLinkText || listing.reviewLinkText,
        price: Number.isFinite(Number(draft.price)) ? Number(draft.price) : listing.price,
        quantity: Number.isFinite(Number(draft.quantity)) ? Math.max(1, Number(draft.quantity)) : listing.quantity,
        condition: draft.condition || listing.condition,
        descriptionText: draft.descriptionText || defaultDescription(listing),
        sellerNotes: draft.sellerNotes || defaultNotes(listing),
        protection: "protection" in draft ? Boolean(draft.protection) : Boolean(listing.protection),
        brand: draft.brand || listing.brand,
        mpn: draft.mpn || listing.mpn,
        fitment: draft.fitment || listing.fitment,
        location: draft.location || listing.location,
        shipping: draft.shipping || listing.shipping,
        returns: draft.returns || listing.returns,
      };
    }

    function collectCurrentDraft() {
      const listing = listings[activeIndex];
      const specs = {};
      document.querySelectorAll("[data-spec-key]").forEach((input) => {
        specs[input.getAttribute("data-spec-key")] = input.value.trim();
      });
      return {
        title: editTitle.value.trim() || title.textContent.trim() || listing.title,
        displayPartNumber: editDisplayPartNumber.value.trim() || listing.displayPartNumber,
        fitmentLinkText: editFitmentLinkText.value.trim() || listing.fitmentLinkText,
        reviewLinkText: editReviewLinkText.value.trim() || listing.reviewLinkText,
        price: parseMoneyValue(editPrice.value || priceInput.value, listing.price),
        quantity: Math.max(1, Number(editQuantity.value || qtyValue.textContent || 1)),
        condition: editCondition.value.trim() || specs.condition || conditionText.textContent.trim() || "Used",
        descriptionText: editDescription.value.trim() || description.value.trim() || defaultDescription(listing),
        sellerNotes: editSellerNotes.value.trim() || defaultNotes(listing),
        protection: protectionInput.checked,
        brand: editBrand.value.trim() || specs.brand || listing.brand,
        mpn: editMpn.value.trim() || specs.mpn || listing.mpn,
        fitment: editFitment.value.trim() || specs.fitment || listing.fitment,
        location: editLocation.value.trim() || specs.location || listing.location,
        shipping: editShipping.value.trim() || specs.shipping || listing.shipping,
        returns: editReturns.value.trim() || specs.returns || listing.returns,
        savedAt: new Date().toISOString(),
      };
    }

    function saveCurrentDraft(showMessage = true) {
      const listing = listings[activeIndex];
      const draft = collectCurrentDraft();
      localStorage.setItem(storageKey(listing.partNumber), JSON.stringify(draft));
      if (showMessage) notify("Saved " + listing.partNumber + " in this browser");
      return draft;
    }

    function parseMoneyValue(value, fallback) {
      const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    }

    function fillTextEditor(view) {
      editTitle.value = view.title;
      editDisplayPartNumber.value = view.displayPartNumber;
      editFitmentLinkText.value = view.fitmentLinkText;
      editReviewLinkText.value = view.reviewLinkText;
      editPrice.value = money(view.price);
      editQuantity.value = String(view.quantity);
      editCondition.value = view.condition;
      editBrand.value = view.brand;
      editMpn.value = view.mpn;
      editFitment.value = view.fitment;
      editLocation.value = view.location;
      editShipping.value = view.shipping;
      editReturns.value = view.returns;
      editDescription.value = view.descriptionText;
      editSellerNotes.value = view.sellerNotes;
    }

    function applyTextEditorToPreview(saveDraft = true) {
      const listing = listings[activeIndex];
      const draft = collectCurrentDraft();
      const view = { ...effectiveListing(listing), ...draft };
      title.textContent = view.title;
      priceInput.value = money(view.price);
      qtyValue.textContent = String(view.quantity);
      conditionText.textContent = view.condition;
      payLater.textContent = "as low as " + money(view.price / 4) + "/mo with Klarna. Learn more";
      description.value = view.descriptionText;
      renderDescriptionPreview(view);
      renderDetails(listing, view);
      renderSimilar();
      if (saveDraft) localStorage.setItem(storageKey(listing.partNumber), JSON.stringify(draft));
    }

    function renderDescriptionPreview(view) {
      displayPartNumberPreview.textContent = view.displayPartNumber;
      fitmentLinkPreview.textContent = view.fitmentLinkText;
      reviewLinkPreview.textContent = view.reviewLinkText;
      descriptionPreview.textContent = view.descriptionText;
      descriptionPreview.classList.toggle("expanded", descriptionExpanded);
      readToggle.textContent = descriptionExpanded ? "Read Less" : "Read More";
    }

    function notify(message) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.add("show");
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
    }

    function selectLayer(targetSelector, shouldScroll = true) {
      const target = document.querySelector(targetSelector);
      if (!target) return;
      layerItems.forEach((item) => item.classList.toggle("active", item.getAttribute("data-layer-target") === targetSelector));
      document.querySelectorAll(".canvas-highlight").forEach((item) => item.classList.remove("canvas-highlight"));
      target.classList.add("canvas-highlight");
      window.setTimeout(() => target.classList.remove("canvas-highlight"), 1600);
      if (shouldScroll) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function focusEditorPanel(panelId) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      panel.classList.add("canvas-highlight");
      window.setTimeout(() => panel.classList.remove("canvas-highlight"), 1600);
      const focusTarget = panel.querySelector("input, textarea, button");
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }

    function downloadJson(filename, value) {
      const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    }

    function buildEditPacket() {
      saveCurrentDraft(false);
      const images = Array.from(pendingImageUploads.values()).map((image) => ({
        partNumber: image.partNumber,
        name: image.name,
        type: image.type,
        size: image.size,
        dataUrl: image.dataUrl,
      }));
      return {
        source: "roadrunner-ebay-live-mockup-gallery",
        exportedAt: new Date().toISOString(),
        activePartNumber: listings[activeIndex].partNumber,
        editCount: listings.length,
        imageCount: images.length,
        images,
        edits: listings.map((item) => {
          const view = effectiveListing(item);
          const pendingImage = pendingImageFor(item);
          return {
            partNumber: item.partNumber,
            displayPartNumber: view.displayPartNumber,
            diagramId: item.diagramId || "",
            category: item.category || "",
            title: view.title,
            price: view.price,
            quantity: view.quantity,
            condition: view.condition,
            descriptionText: view.descriptionText,
            fitmentLinkText: view.fitmentLinkText,
            reviewLinkText: view.reviewLinkText,
            sellerNotes: view.sellerNotes,
            brand: view.brand,
            mpn: view.mpn,
            fitment: view.fitment,
            location: view.location,
            shipping: view.shipping,
            returns: view.returns,
            protection: view.protection,
            hasPhoto: item.hasPhoto || Boolean(pendingImage),
            approvedImage: item.approvedImage || "",
            pendingImageName: pendingImage ? pendingImage.name : "",
          };
        }),
      };
    }

    async function postCommitPacket(packet, secret) {
      const headers = { "content-type": "application/json" };
      if (secret) headers["x-rrp-commit-secret"] = secret;
      const response = await fetch("/api/ebay/mockup-edits", {
        method: "POST",
        headers,
        body: JSON.stringify(packet),
      });
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, body };
    }

    async function postLiveState(packet) {
      const response = await fetch("/api/ebay/mockup-live-state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(packet),
      });
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, body };
    }

    function currentListingForAi() {
      const listing = listings[activeIndex];
      const view = { ...effectiveListing(listing), ...collectCurrentDraft() };
      return {
        partNumber: listing.partNumber,
        diagramId: listing.diagramId || "",
        category: listing.category || "",
        supersedes: listing.supersedes || "",
        hasPhoto: Boolean(listing.hasPhoto || pendingImageFor(listing)),
        title: view.title,
        displayPartNumber: view.displayPartNumber,
        fitmentLinkText: view.fitmentLinkText,
        reviewLinkText: view.reviewLinkText,
        price: view.price,
        quantity: view.quantity,
        condition: view.condition,
        descriptionText: view.descriptionText,
        sellerNotes: view.sellerNotes,
        brand: view.brand,
        mpn: view.mpn,
        fitment: view.fitment,
        location: view.location,
        shipping: view.shipping,
        returns: view.returns,
      };
    }

    function applyAiEdit(edit) {
      if (!edit || typeof edit !== "object") return;
      const setters = {
        title: editTitle,
        displayPartNumber: editDisplayPartNumber,
        fitmentLinkText: editFitmentLinkText,
        reviewLinkText: editReviewLinkText,
        condition: editCondition,
        descriptionText: editDescription,
        sellerNotes: editSellerNotes,
        brand: editBrand,
        mpn: editMpn,
        fitment: editFitment,
        location: editLocation,
        shipping: editShipping,
        returns: editReturns,
      };
      Object.entries(setters).forEach(([key, field]) => {
        if (typeof edit[key] === "string" && edit[key].trim()) field.value = edit[key].trim();
      });
      if (Number.isFinite(Number(edit.price))) editPrice.value = money(Number(edit.price));
      if (Number.isFinite(Number(edit.quantity))) editQuantity.value = String(Math.max(1, Number(edit.quantity)));
      applyTextEditorToPreview(true);
      const notes = [];
      if (edit.rationale) notes.push(edit.rationale);
      if (Array.isArray(edit.warnings) && edit.warnings.length) notes.push(edit.warnings.join(" "));
      aiStatus.textContent = notes.join(" ") || "AI edit applied to the frontend fields.";
    }

    function officeEditorSession() {
      try {
        const parsed = JSON.parse(localStorage.getItem(officeEditorSessionKey) || "{}");
        if (!parsed || typeof parsed !== "object") return {};
        const model = typeof parsed.model === "string" && /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(parsed.model)
          ? parsed.model
          : "";
        const apiOptions = parsed.apiOptions && typeof parsed.apiOptions === "object" ? parsed.apiOptions : {};
        return { model, apiOptions, updatedAt: parsed.updatedAt || "" };
      } catch {
        return {};
      }
    }

    const savedOfficeSession = officeEditorSession();
    if (savedOfficeSession.model) {
      aiModelId.value = savedOfficeSession.model;
      aiStatus.textContent = "Using BOM workspace session: " + savedOfficeSession.model;
    }

    async function requestAiEdit(mode) {
      const session = officeEditorSession();
      const instruction = mode === "description"
        ? "Rewrite only descriptionText. Keep it natural for a used appliance part and do not add unsupported compatibility, testing, OEM, or condition claims. Operator note: " + aiPrompt.value.trim()
        : aiPrompt.value.trim();
      const model = session.model || aiModelId.value.trim() || "gemini-3.1-flash-lite";
      if (!instruction) {
        aiStatus.textContent = "Enter an instruction first.";
        return;
      }
      if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
        aiStatus.textContent = "Model must be a Gemini API model ID starting with gemini-.";
        return;
      }
      aiStatus.textContent = "Asking " + model + (session.model ? " from BOM workspace session" : "") + " for structured listing edits...";
      try {
        const response = await fetch("/api/ebay/mockup-ai-edit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            instruction,
            model,
            apiOptions: session.apiOptions,
            listing: currentListingForAi(),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.edit) {
          aiStatus.textContent = (body && body.error) ? body.error : "AI edit failed.";
          return;
        }
        applyAiEdit(body.edit);
        notify("AI edit applied with " + (body.model || model));
      } catch {
        aiStatus.textContent = "AI edit endpoint unavailable.";
      }
    }

    function applyRemoteState(state) {
      if (!state || typeof state !== "object") return false;
      const edits = Array.isArray(state.edits) ? state.edits : [];
      edits.forEach((edit) => {
        const partNumber = String(edit.partNumber || "").toUpperCase();
        const listing = listings.find((item) => item.partNumber === partNumber);
        if (!listing) return;
        [
          "title",
          "displayPartNumber",
          "fitmentLinkText",
          "reviewLinkText",
          "condition",
          "descriptionText",
          "sellerNotes",
          "brand",
          "mpn",
          "fitment",
          "location",
          "shipping",
          "returns",
        ].forEach((key) => {
          if (typeof edit[key] === "string" && edit[key].trim()) listing[key] = edit[key].trim();
        });
        if (Number.isFinite(Number(edit.price))) listing.price = Number(edit.price);
        if (Number.isFinite(Number(edit.quantity))) listing.quantity = Math.max(1, Number(edit.quantity));
        if ("protection" in edit) listing.protection = Boolean(edit.protection);
      });

      const imageManifest = Array.isArray(state.imageManifest) ? state.imageManifest : [];
      imageManifest.forEach((image) => {
        const partNumber = String(image.partNumber || "").toUpperCase();
        const imageUrl = String(image.url || image.downloadUrl || "").trim();
        const listing = listings.find((item) => item.partNumber === partNumber);
        if (!listing || !imageUrl) return;
        listing.approvedImage = imageUrl;
        listing.publicImageUrl = imageUrl;
        listing.imageFiles = [imageUrl, ...(Array.isArray(listing.imageFiles) ? listing.imageFiles.filter((url) => url !== imageUrl) : [])];
        listing.hasPhoto = true;
        listing.photoGate = "operator_sale_photo_ready";
      });
      return edits.length > 0 || imageManifest.length > 0;
    }

    async function loadLiveState() {
      try {
        const response = await fetch("/api/ebay/mockup-live-state", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body.state && applyRemoteState(body.state)) {
          showListing(activeIndex);
        }
      } catch {
        // Live state is optional; the static generated data remains the fallback.
      }
    }

    async function publishLiveState() {
      const packet = buildEditPacket();
      const result = await postLiveState(packet);
      if (!result.ok) {
        downloadJson("roadrunner-ebay-live-publish-packet.json", packet);
        notify((result.body && result.body.error ? result.body.error + ". " : "") + "Downloaded publish packet.");
        return;
      }
      applyRemoteState(result.body.state);
      pendingImageUploads.forEach((image) => {
        if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      });
      pendingImageUploads.clear();
      showListing(activeIndex);
      notify("Published live edits/images");
    }

    async function commitCurrentEdits() {
      const packet = buildEditPacket();
      try {
        let result = await postCommitPacket(packet, "");
        if (result.status === 401) {
          const secret = window.prompt("Commit secret");
          if (secret === null) return;
          result = await postCommitPacket(packet, secret);
        }
        if (result.ok) {
          const url = result.body && result.body.commitUrl ? result.body.commitUrl : "";
          if (url) await copyText(url);
          notify(url ? "Committed edits/images; commit URL copied" : "Committed edits/images");
          return;
        }
        downloadJson("roadrunner-ebay-commit-packet.json", packet);
        notify((result.body && result.body.error ? result.body.error + ". " : "") + "Downloaded commit packet.");
      } catch {
        downloadJson("roadrunner-ebay-commit-packet.json", packet);
        notify("Commit endpoint unavailable. Downloaded commit packet.");
      }
    }

    function renderStrip() {
      partStrip.innerHTML = listings.map((listing, index) => (
        '<button class="part-pill ' + (index === activeIndex ? 'active' : '') + '" onclick="showListing(' + index + ')">' +
        listing.partNumber +
        '</button>'
      )).join("");
    }

    function renderThumbs(listing) {
      const files = imageFilesFor(listing);
      if (files.length) {
        thumbs.innerHTML = files.slice(0, 6).map((url, index) => (
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
      if (!hasListingPhoto(listing)) return;
      activePhotoIndex = imageIndex;
      const files = imageFilesFor(listing);
      const imageUrl = files[imageIndex] || primaryImageFor(listing);
      mainImage.innerHTML = '<button class="media-float float-expand" data-action="expand-photo">+</button><button class="media-float float-heart" data-action="favorite-photo">H</button><button class="media-float float-prev" data-action="photo-prev" onclick="prevPhoto()">&lt;</button><button class="media-float float-next" data-action="photo-next" onclick="nextPhoto()">&gt;</button><img src="' + imageUrl + '" alt="' + listing.title + '">';
      document.querySelectorAll(".thumb").forEach((thumb, i) => {
        thumb.classList.toggle("active", i === imageIndex);
      });
    }

    function prevPhoto() {
      const listing = listings[activeIndex];
      const files = imageFilesFor(listing);
      if (!hasListingPhoto(listing) || files.length < 2) return;
      const newIndex = (activePhotoIndex - 1 + files.length) % files.length;
      setMainPhoto(activeIndex, newIndex);
    }

    function nextPhoto() {
      const listing = listings[activeIndex];
      const files = imageFilesFor(listing);
      if (!hasListingPhoto(listing) || files.length < 2) return;
      const newIndex = (activePhotoIndex + 1) % files.length;
      setMainPhoto(activeIndex, newIndex);
    }

    function renderMainImage(listing) {
      activePhotoIndex = 0;
      const imageUrl = primaryImageFor(listing);
      if (imageUrl) {
        mainImage.innerHTML = '<button class="media-float float-expand" data-action="expand-photo">+</button><button class="media-float float-heart" data-action="favorite-photo">H</button><button class="media-float float-prev" data-action="photo-prev" onclick="prevPhoto()">&lt;</button><button class="media-float float-next" data-action="photo-next" onclick="nextPhoto()">&gt;</button><img src="' + imageUrl + '" alt="' + listing.title + '">';
        return;
      }

      mainImage.innerHTML =
        '<button class="media-float float-expand" data-action="expand-photo">+</button><button class="media-float float-heart" data-action="favorite-photo">H</button><button class="media-float float-prev" data-action="photo-prev">&lt;</button><button class="media-float float-next" data-action="photo-next">&gt;</button>' +
        '<div class="photo-pending">' +
          '<div>' +
            '<div class="photo-icon">+</div>' +
            '<h2>Photo pending</h2>' +
            '<p>' + listing.partNumber + ' needs operator-owned sale photos before this listing is stage-ready. ' + (listing.heldReferenceImageCount ? listing.heldReferenceImageCount + ' provider/reference image(s) were found and intentionally blocked from the lead image. ' : '') + 'Use clear product photos only; no scraped, watermarked, or rights-unclear images.</p>' +
          '</div>' +
        '</div>';
    }

    function renderDetails(listing, view) {
      const pendingImage = pendingImageFor(listing);
      const photoGate = pendingImage ? "operator_sale_photo_uploaded_pending_commit" : listing.photoGate;
      specificsTable.innerHTML = [
        ["condition", "Condition", view.condition, false],
        ["brand", "Brand", view.brand, false],
        ["mpn", "MPN", view.mpn, false],
        ["partNumber", "Part Number", listing.partNumber, true],
        ["diagramId", "Diagram ID", listing.diagramId || "-", true],
        ["category", "Type", listing.category, true],
        ["fitment", "Compatible Model", view.fitment, false],
        ["supersedes", "Supersedes", listing.supersedes || "N/A", true],
        ["location", "Item Location", view.location, false],
        ["shipping", "Shipping", view.shipping, false],
        ["returns", "Returns", view.returns, false],
        ["photoGate", "Photo Gate", photoGate, true],
        ["heldReferenceImageCount", "Reference Images Held", String(listing.heldReferenceImageCount || 0), true]
      ].map(([key, label, value, readonly]) => (
        '<tr><td>' + label + '</td><td><input data-spec-key="' + key + '" value="' + escapeHtmlAttr(value) + '"' + (readonly ? ' readonly tabindex="-1"' : '') + '></td></tr>'
      )).join("");
      savePartLabel.textContent = listing.partNumber + ' - ' + listing.category;
    }

    function renderSimilar() {
      const related = listings
        .filter((_, index) => index !== activeIndex)
        .slice(activeIndex + 1)
        .concat(listings)
        .filter((_, index, array) => array.findIndex((item) => item.partNumber === _.partNumber) === index)
        .slice(0, 5);

      similarGrid.innerHTML = related.map((listing) => {
        const view = effectiveListing(listing);
        const imageUrl = primaryImageFor(listing);
        const imgHtml = imageUrl
          ? '<img src="' + imageUrl + '" alt="' + escapeHtmlAttr(view.title) + '">'
          : '<span style="color:#94a3b8;font-size:13px">No image</span>';
        const realIndex = listings.findIndex((item) => item.partNumber === listing.partNumber);
        return (
          '<article class="similar-card" onclick="showListing(' + realIndex + ')">' +
            '<div class="similar-img">' + imgHtml + '</div>' +
            '<div class="similar-body">' +
              '<div>' + escapeHtml(view.title) + '</div>' +
              '<div class="similar-price">' + money(view.price) + '</div>' +
              '<div class="similar-shipping">Free shipping</div>' +
            '</div>' +
          '</article>'
        );
      }).join("");
    }

    function showListing(index) {
      if (listings[activeIndex]) saveCurrentDraft(false);
      activeIndex = index;
      const listing = listings[index];
      const view = effectiveListing(listing);
      descriptionExpanded = false;
      renderStrip();
      renderThumbs(listing);
      renderMainImage(listing);
      refreshImageEditor(listing);

      title.textContent = view.title;
      fillTextEditor(view);
      priceInput.value = money(view.price);
      qtyValue.textContent = String(view.quantity);
      conditionText.textContent = view.condition;
      protectionInput.checked = view.protection;
      payLater.textContent = "as low as " + money(view.price / 4) + "/mo with Klarna. Learn more";
      description.value = view.descriptionText;
      renderDescriptionPreview(view);
      listingAlert.textContent = pendingImageFor(listing)
        ? "Uploaded image preview is attached. Commit to publish it into the approved sale-photo folder."
        : listing.hasPhoto
          ? "Operator review mode: only approved local sale photos are shown here. Verify condition and fitment before staging."
          : "Photo hold: provider/reference images are blocked from the lead photo. Add operator-owned sale photos before this item can be staged.";

      renderDetails(listing, view);
      renderSimilar();
      if (layerPartLabel) layerPartLabel.textContent = listing.partNumber;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    showListing(0);

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function escapeHtmlAttr(value) {
      return escapeHtml(value).replace(/"/g, "&quot;");
    }

    priceInput.addEventListener("change", function() {
      const listing = listings[activeIndex];
      const num = parseMoneyValue(this.value, effectiveListing(listing).price);
      this.value = money(num);
      editPrice.value = money(num);
      payLater.textContent = "as low as " + money(num / 4) + "/mo with Klarna. Learn more";
      saveCurrentDraft(false);
    });

    editorFields.forEach((field) => {
      field.addEventListener("input", () => applyTextEditorToPreview(true));
      field.addEventListener("change", () => {
        if (field === editPrice) editPrice.value = money(parseMoneyValue(editPrice.value, listings[activeIndex].price));
        if (field === editQuantity) editQuantity.value = String(Math.max(1, Number(editQuantity.value || 1)));
        applyTextEditorToPreview(true);
      });
    });

    description.addEventListener("input", () => {
      editDescription.value = description.value;
      applyTextEditorToPreview(true);
    });
    protectionInput.addEventListener("change", () => {
      saveCurrentDraft(false);
      renderDetails(listings[activeIndex], effectiveListing(listings[activeIndex]));
    });
    imageUpload.addEventListener("change", async () => {
      const file = imageUpload.files && imageUpload.files[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
        imageUpload.value = "";
        notify("Use JPG, PNG, WEBP, or AVIF images");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        imageUpload.value = "";
        notify("Image is over 8 MB");
        return;
      }
      const listing = listings[activeIndex];
      const existing = pendingImageUploads.get(listing.partNumber);
      if (existing && existing.previewUrl) URL.revokeObjectURL(existing.previewUrl);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const previewUrl = URL.createObjectURL(file);
        pendingImageUploads.set(listing.partNumber, {
          partNumber: listing.partNumber,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
          previewUrl,
          selectedAt: new Date().toISOString(),
        });
        refreshImageEditor(listing);
        renderThumbs(listing);
        renderMainImage(listing);
        renderDetails(listing, effectiveListing(listing));
        renderSimilar();
        listingAlert.textContent = "Uploaded image preview is attached. Commit to publish it into the approved sale-photo folder.";
        notify("Image preview attached for " + listing.partNumber);
      } catch {
        imageUpload.value = "";
        notify("Could not read image file");
      }
    });
    specificsTable.addEventListener("input", () => {
      document.querySelectorAll("[data-spec-key]").forEach((input) => {
        if (input.getAttribute("data-spec-key") === "condition") editCondition.value = input.value;
        if (input.getAttribute("data-spec-key") === "brand") editBrand.value = input.value;
        if (input.getAttribute("data-spec-key") === "mpn") editMpn.value = input.value;
        if (input.getAttribute("data-spec-key") === "fitment") editFitment.value = input.value;
        if (input.getAttribute("data-spec-key") === "location") editLocation.value = input.value;
        if (input.getAttribute("data-spec-key") === "shipping") editShipping.value = input.value;
        if (input.getAttribute("data-spec-key") === "returns") editReturns.value = input.value;
      });
      applyTextEditorToPreview(true);
    });

    /* Tab switching */
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.getAttribute("data-tab")).classList.add("active");
      });
    });

    /* Fullscreen overlay */
    function openFullscreen() {
      const img = mainImage.querySelector("img");
      if (!img) { notify("No photo to expand"); return; }
      document.getElementById("fullscreenImg").src = img.src;
      document.getElementById("fullscreenOverlay").classList.add("open");
    }
    function closeFullscreen() {
      document.getElementById("fullscreenOverlay").classList.remove("open");
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeFullscreen();
    });

    /* Save-bar global functions */
    function resetListing() {
      const listing = listings[activeIndex];
      localStorage.removeItem(storageKey(listing.partNumber));
      notify("Reset " + listing.partNumber);
      showListing(activeIndex);
    }
    function copyListingJSON() {
      const payload = { partNumber: listings[activeIndex].partNumber, ...collectCurrentDraft() };
      copyText(JSON.stringify(payload, null, 2)).then(() => notify("Copied " + listings[activeIndex].partNumber + " JSON"));
    }
    function exportAllJSON() {
      downloadJson("roadrunner-ebay-live-edits.json", buildEditPacket());
      notify("Downloaded all edits as JSON");
    }
    function saveListing() {
      saveCurrentDraft(true);
    }

    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.getAttribute("data-action");
      const listing = listings[activeIndex];
      if (action === "qty-up" || action === "qty-down") {
        const current = Math.max(1, Number(qtyValue.textContent || 1));
        qtyValue.textContent = String(Math.max(1, current + (action === "qty-up" ? 1 : -1)));
        editQuantity.value = qtyValue.textContent;
        saveCurrentDraft(false);
        return;
      }
      if (action === "save") {
        saveCurrentDraft(true);
        return;
      }
      if (action === "reset") {
        localStorage.removeItem(storageKey(listing.partNumber));
        notify("Reset " + listing.partNumber);
        showListing(activeIndex);
        return;
      }
      if (action === "copy") {
        const payload = { partNumber: listing.partNumber, ...saveCurrentDraft(false) };
        await copyText(JSON.stringify(payload, null, 2));
        notify("Copied " + listing.partNumber + " JSON");
        return;
      }
      if (action === "export") {
        const payload = buildEditPacket();
        downloadJson("roadrunner-ebay-live-edits.json", payload);
        notify("Downloaded current browser edits");
        return;
      }
      if (action === "publish") {
        await publishLiveState();
        return;
      }
      if (action === "ai-apply") {
        await requestAiEdit("all");
        return;
      }
      if (action === "ai-description") {
        await requestAiEdit("description");
        return;
      }
      if (action === "commit") {
        await commitCurrentEdits();
        return;
      }
      if (action === "clear-upload") {
        const pending = pendingImageUploads.get(listing.partNumber);
        if (pending && pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        pendingImageUploads.delete(listing.partNumber);
        refreshImageEditor(listing);
        renderThumbs(listing);
        renderMainImage(listing);
        renderDetails(listing, effectiveListing(listing));
        renderSimilar();
        listingAlert.textContent = listing.hasPhoto
          ? "Operator review mode: only approved local sale photos are shown here. Verify condition and fitment before staging."
          : "Photo hold: provider/reference images are blocked from the lead photo. Add operator-owned sale photos before this item can be staged.";
        notify("Cleared uploaded image for " + listing.partNumber);
        return;
      }
      if (action === "share") {
        await copyText(location.href.split("#")[0] + "#" + listing.partNumber);
        notify("Copied share link for " + listing.partNumber);
        return;
      }
      if (action === "expand-photo") {
        openFullscreen();
        return;
      }
      if (action === "favorite-photo") {
        button.classList.toggle("active");
        notify("Photo marked for operator review");
        return;
      }
      if (action === "photo-prev" || action === "photo-next") {
        const files = imageFilesFor(listing);
        if (!hasListingPhoto(listing) || files.length < 2) notify("No additional approved photos yet");
        return;
      }
      if (action === "watch") {
        button.textContent = button.textContent.includes("Added") ? "Add to Watchlist" : "Added to Watchlist";
        notify(button.textContent + " for " + listing.partNumber);
        return;
      }
      if (action === "cart") {
        notify(listing.partNumber + " added to review cart");
        return;
      }
      if (action === "buy-now") {
        notify("Review gate: " + listing.partNumber + " is not staged to eBay from this mockup.");
        return;
      }
      if (action === "sell-like" || action === "sell-other") {
        notify("Seller flow captured locally. Export JSON when ready.");
        return;
      }
      if (action === "message") {
        editSellerNotes.focus();
        notify("Seller notes focused");
        return;
      }
      if (action === "fitment-link") {
        editFitment.focus();
        notify("Fitment field focused");
        return;
      }
      if (action === "review-link") {
        editSellerNotes.focus();
        notify("Review/seller note field focused");
        return;
      }
      if (action === "read-toggle") {
        descriptionExpanded = !descriptionExpanded;
        renderDescriptionPreview(effectiveListing(listing));
        return;
      }
      if (action === "see-all") {
        document.querySelector(".part-strip").scrollIntoView({ behavior: "smooth", block: "center" });
        notify("Showing current 41-part scope");
      }
    });

    aiModelPreset.addEventListener("change", () => {
      if (aiModelPreset.value !== "custom") {
        aiModelId.value = aiModelPreset.value;
      }
    });

    document.querySelector(".layer-panel").addEventListener("click", (event) => {
      const layerButton = event.target.closest("[data-layer-target]");
      if (layerButton) {
        selectLayer(layerButton.getAttribute("data-layer-target"), true);
        return;
      }
      const editorButton = event.target.closest("[data-editor-target]");
      if (editorButton) {
        focusEditorPanel(editorButton.getAttribute("data-editor-target"));
      }
    });

    document.getElementById("searchBtn").addEventListener("click", () => {
      const query = document.getElementById("searchInput").value.trim().toUpperCase();
      const index = listings.findIndex((item) => item.partNumber.includes(query) || item.title.toUpperCase().includes(query));
      if (index >= 0) showListing(index);
      notify(index >= 0 ? "Opened " + listings[index].partNumber : "No current-scope match");
    });
    document.getElementById("advancedBtn").addEventListener("click", () => notify("Advanced filters are represented by the 41-part strip."));
    document.getElementById("liveBtn").addEventListener("click", () => document.querySelector(".scope-strip").scrollIntoView({ behavior: "smooth", block: "center" }));
    window.addEventListener("beforeunload", () => saveCurrentDraft(false));
    if (location.hash) {
      const token = decodeURIComponent(location.hash.slice(1)).toUpperCase();
      const index = listings.findIndex((item) => item.partNumber === token);
      if (index >= 0) showListing(index);
    }
    loadLiveState();
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
      approvedSaleImagesAttached: partsWithImages,
      heldReferenceImageCount: parts.reduce((sum, part) => sum + part.heldReferenceImageCount, 0),
      missingCount: missingImages.length,
      missingParts: parts
        .filter((part) => !part.hasPhoto)
        .map((part) => ({
          partNumber: part.partNumber,
          diagramId: part.diagramId,
          description: part.description,
          heldReferenceImageCount: part.heldReferenceImageCount,
        })),
      attachedParts: parts
        .filter((part) => part.hasPhoto)
        .map((part) => ({
          partNumber: part.partNumber,
          imageCount: part.imageFiles.length,
          primaryImage: part.imageSourcePath,
          publicPrimaryImage: part.publicImageUrl,
          publicPrimaryImagePath: part.publicImagePath,
          heldReferenceImageCount: part.heldReferenceImageCount,
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
