import fs from "fs";
import path from "path";

const DEFAULT_INPUT = "scratch/ebay-html-current/listings.normalized.json";
const DEFAULT_OUTPUT_DIR = "scratch/ebay-automation-chain-current";
const DEFAULT_PROMPT_PATH = "scratch/ebay_prompt_chain.txt";
const DEFAULT_APPROVED_IMAGE_ROOT = "scratch/approved-images";
const DEFAULT_LEGACY_CHAIN = "scratch/ebay-zero-drift-final-52/chain-payloads.json";
const DEFAULT_DESCRIPTION_EVIDENCE = "scratch/description-evidence/reliableparts-descriptions.json";
const DEFAULT_IMAGE_EVIDENCE = "scratch/image-evidence/reliableparts-images.json";
const DEFAULT_LOCAL_IMAGE_EVIDENCE_DIR = "scratch/image-evidence";

const DONOR_MACHINE_ID = {
  Brand: "Hotpoint",
  Model_Number: "HTDX100ED3WW",
  Serial_Number: "ZA801821C",
  Type: "Electric Dryer",
  Session_ID: "HTDX100ED3WW_ZA801821C",
};

const DIAGRAMS = {
  "BACKSPLASH, BLOWER & DRIVE ASSEMBLY": {
    imagePath: "public\\diagrams\\HTDX100ED3WW\\backsplash-blower-drive-assembly.png",
    imageUrl: "/diagrams/HTDX100ED3WW/backsplash-blower-drive-assembly.png",
  },
  "CABINET & TOP PANEL": {
    imagePath: "public\\diagrams\\HTDX100ED3WW\\cabinet-top-panel.png",
    imageUrl: "/diagrams/HTDX100ED3WW/cabinet-top-panel.png",
  },
  DRUM: {
    imagePath: "public\\diagrams\\HTDX100ED3WW\\drum.png",
    imageUrl: "/diagrams/HTDX100ED3WW/drum.png",
  },
  "FRONT PANEL & DOOR": {
    imagePath: "public\\diagrams\\HTDX100ED3WW\\front-panel-door.png",
    imageUrl: "/diagrams/HTDX100ED3WW/front-panel-door.png",
  },
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const outputDir = String(args.get("output-dir") || DEFAULT_OUTPUT_DIR);
const promptPath = String(args.get("prompt") || DEFAULT_PROMPT_PATH);
const approvedImageRoot = String(args.get("approved-image-root") || DEFAULT_APPROVED_IMAGE_ROOT);
const legacyChainPath = String(args.get("legacy-chain") || DEFAULT_LEGACY_CHAIN);
const descriptionEvidencePath = String(args.get("description-evidence") || DEFAULT_DESCRIPTION_EVIDENCE);
const imageEvidencePath = String(args.get("image-evidence") || DEFAULT_IMAGE_EVIDENCE);
const localImageEvidenceDir = String(args.get("local-image-evidence-dir") || DEFAULT_LOCAL_IMAGE_EVIDENCE_DIR);
const liveEbaySync = String(args.get("live-ebay-sync") || "false").toLowerCase() === "true";

if (liveEbaySync) {
  throw new Error("live-ebay-sync=true is blocked for this local prompt-chain runner.");
}

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

function parseJsonWithListings(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const listings = Array.isArray(parsed) ? parsed : parsed.listings || parsed.parts;
  if (!Array.isArray(listings)) {
    throw new Error(`Expected an array or { listings: [] } in ${filePath}`);
  }
  return listings;
}

function readPromptSummary(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .filter((line) => /PROMPT|STATE|Phase|FAIL|Trust Shard|DONOR_MACHINE_ID|PART_ID|SYSTEM_ROUTING/i.test(line))
    .slice(0, 36);
  return lines.join("\n");
}

function loadLegacyMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const listings = Array.isArray(parsed.listings) ? parsed.listings : [];
  for (const listing of listings) {
    const mpn = listing?.ebay_listing_payload?.itemSpecifics?.MPN;
    if (!mpn) continue;
    map.set(String(mpn).toUpperCase(), listing);
  }
  return map;
}

function loadDescriptionEvidenceMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed.descriptions || parsed.descriptionEvidence || [];
  if (!Array.isArray(records)) return map;
  for (const record of records) {
    const partNumber = String(
      record?.partNumber ||
        record?.mpn ||
        record?.OEM_Part_Number ||
        record?.ebay_listing_payload?.itemSpecifics?.MPN ||
        "",
    )
      .trim()
      .toUpperCase();
    if (!partNumber || !record?.descriptionText) continue;
    map.set(partNumber, {
      partNumber,
      source: record.source || "unknown",
      evidenceType: record.evidenceType || "product_description",
      identityMatch: record.identityMatch || "unknown",
      pageUrl: record.pageUrl || "",
      pageUrlSource: record.pageUrlSource || "",
      capturedAt: record.capturedAt || "",
      selector: record.selector || "",
      title: record.title || "",
      sku: record.sku || "",
      descriptionText: record.descriptionText,
      listingUsePolicy:
        record.listingUsePolicy ||
        "source evidence only; rewrite in Roadrunner wording before staging",
    });
  }
  return map;
}

function loadImageEvidenceMap(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const records = Array.isArray(parsed) ? parsed : parsed.images || parsed.imageEvidence || [];
  if (!Array.isArray(records)) return map;
  for (const record of records) {
    const partNumber = String(record?.partNumber || record?.mpn || "").trim().toUpperCase();
    if (!partNumber || !Array.isArray(record?.candidates) || record.candidates.length === 0) continue;
    map.set(partNumber, {
      partNumber,
      source: record.source || "unknown",
      evidenceType: record.evidenceType || "product_image_set",
      identityMatch: record.identityMatch || "unknown",
      pageUrl: record.pageUrl || "",
      pageUrlSource: record.pageUrlSource || "",
      capturedAt: record.capturedAt || "",
      title: record.title || "",
      sku: record.sku || "",
      reviewStatus: record.reviewStatus || "candidate_needs_operator_review",
      listingUsePolicy:
        record.listingUsePolicy ||
        "image evidence only; operator must verify watermark/use rights and approve physical sale photos before staging",
      candidates: record.candidates.map((candidate) => ({
        imageUrl: candidate.imageUrl || "",
        thumbnailUrl: candidate.thumbnailUrl || candidate.imageUrl || "",
        pageUrl: candidate.pageUrl || record.pageUrl || "",
        source: candidate.source || record.source || "unknown",
        imageHost: candidate.imageHost || "",
        title: candidate.title || "",
        alt: candidate.alt || "",
        selector: candidate.selector || "",
        reviewStatus: candidate.reviewStatus || record.reviewStatus || "candidate_needs_operator_review",
        listingUsePolicy: candidate.listingUsePolicy || record.listingUsePolicy || "",
      })),
    });
  }
  return map;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const stack = [rootDir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else files.push(fullPath);
    }
  }
  return files;
}

function loadApprovedImages(rootDir) {
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const map = new Map();
  for (const filePath of walkFiles(rootDir)) {
    if (!allowed.has(path.extname(filePath).toLowerCase())) continue;
    const key = path.basename(filePath).toUpperCase();
    const partMatch = key.match(/[A-Z]{2}\d{1,2}[A-Z]?\d{2,6}[A-Z]?/);
    if (!partMatch) continue;
    const partNumber = partMatch[0];
    if (!map.has(partNumber)) map.set(partNumber, []);
    map.get(partNumber).push(filePath);
  }
  return map;
}

function normalizePartKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function loadLocalImageEvidence(rootDir, listingsForPartMatch) {
  const allowed = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const knownParts = listingsForPartMatch
    .map((record) => String(record.partNumber || record.specs?.mpn || "").trim().toUpperCase())
    .filter(Boolean)
    .map((partNumber) => ({ partNumber, normalized: normalizePartKey(partNumber) }));
  const map = new Map();

  for (const filePath of walkFiles(rootDir)) {
    if (!allowed.has(path.extname(filePath).toLowerCase())) continue;
    const fileName = path.basename(filePath);
    const normalizedFileName = normalizePartKey(fileName);
    const matchedPart = knownParts.find((part) => normalizedFileName.includes(part.normalized));
    if (!matchedPart) continue;

    const relativeUrl = path.relative(outputDir, filePath).split(path.sep).join("/");
    if (!map.has(matchedPart.partNumber)) {
      map.set(matchedPart.partNumber, {
        partNumber: matchedPart.partNumber,
        source: "local_image_evidence",
        evidenceType: "operator_supplied_image_file_set",
        identityMatch: "filename_part_number_match",
        pageUrl: "",
        pageUrlSource: "scratch/image-evidence local file",
        capturedAt: new Date().toISOString(),
        title: `${matchedPart.partNumber} local image candidates`,
        sku: "",
        reviewStatus: "candidate_needs_operator_review",
        listingUsePolicy:
          "local image evidence only; operator must Keep/Trash and separately approve sale photos before staging",
        candidates: [],
      });
    }

    map.get(matchedPart.partNumber).candidates.push({
      imageUrl: relativeUrl,
      thumbnailUrl: relativeUrl,
      pageUrl: "",
      source: "local_image_evidence",
      imageHost: "local",
      title: fileName,
      alt: `${matchedPart.partNumber} ${fileName}`,
      selector: "scratch/image-evidence file",
      reviewStatus: "candidate_needs_operator_review",
      listingUsePolicy:
        "local image evidence only; operator must Keep/Trash and separately approve sale photos before staging",
    });
  }

  for (const record of map.values()) {
    record.candidates.sort((a, b) => a.title.localeCompare(b.title));
  }

  return map;
}

function parseMoney(value, fallback = 0) {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bAsm\b/g, "Assembly")
    .replace(/\bLh\b/g, "LH")
    .replace(/\bRh\b/g, "RH")
    .replace(/\bOem\b/g, "OEM")
    .replace(/\bGe\b/g, "GE");
}

function cleanPartLabel(record) {
  return String(record.partTitle || record.description || record.title || record.specs?.type || "Appliance Part")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTitle(record) {
  const partNumber = String(record.partNumber || record.specs?.mpn || "").toUpperCase();
  const type = titleCase(cleanPartLabel(record));
  const base = `GE ${partNumber} ${type} Used Dryer Part`;
  if (base.length <= 80) return base;
  const shorter = `GE ${partNumber} ${type.replace(/\bAssembly\b/g, "Asm")} Used Part`;
  if (shorter.length <= 80) return shorter;
  return shorter.slice(0, 77).replace(/\s+\S*$/, "") + "...";
}

function inferSection(record, legacyRecord) {
  const section = legacyRecord?.phase1a?.PART_ID?.Assembly_Diagram_Section;
  if (section && DIAGRAMS[section]) return section;

  const callout = String(record.diagId || record.diagramId || record.specs?.diagramId || "");
  if (/^(50[3-6]|51[0234]|3102|3106)$/.test(callout)) return "DRUM";
  if (/^(30[0157]|31[12367]|380|603)$/.test(callout)) return "FRONT PANEL & DOOR";
  if (/^(40[148]|41[789]|420|430|222|80)$/.test(callout)) return "CABINET & TOP PANEL";
  return "BACKSPLASH, BLOWER & DRIVE ASSEMBLY";
}

function routeReview(record, legacyRecord) {
  const legacy = legacyRecord?.system_routing;
  if (legacy && typeof legacy.hitl_review_required === "boolean") {
    return {
      confidence_score: Number(legacy.confidence_score || 0.95),
      hitl_review_required: legacy.hitl_review_required,
      flag_reason: legacy.flag_reason || "Carried forward from prior local prompt-chain routing artifact.",
    };
  }

  const label = `${record.title || ""} ${record.partTitle || ""} ${record.specs?.type || ""}`.toLowerCase();
  const smallOrAmbiguous = /\b(thermostat|timer|switch|fuse|knob|strap|bracket|bearing|latch|hinge|button|screw|gasket|o-?ring|ground|terminal|wire|resistor|plug|shaft|pulley|glide|slide|seal|clamp|leg|filter|mesh)\b/.test(label);
  if (smallOrAmbiguous) {
    return {
      confidence_score: 0.82,
      hitl_review_required: true,
      flag_reason: "Small, electrical, or generic-looking service part; verify the physical part, terminal layout, and diagram callout before staging.",
    };
  }

  return {
    confidence_score: 0.95,
    hitl_review_required: false,
    flag_reason: "Distinct part title and diagram callout are present in the operator listing artifact.",
  };
}

function techNoteFor(record) {
  const label = `${record.title || ""} ${record.partTitle || ""} ${record.specs?.type || ""}`.toLowerCase();
  if (/motor/.test(label)) return "Match the pulley, plug, and mounting points before ordering; dryer motors can look close while using different harnesses.";
  if (/timer/.test(label)) return "Match the shaft style, terminal layout, and cycle markings before ordering; timer families often share a case but not the same switching.";
  if (/thermostat|switch|fuse/.test(label)) return "Match the number and terminal layout before ordering; several small electrical controls can look similar on the bench.";
  if (/belt|pulley/.test(label)) return "Confirm the belt path and pulley geometry against your original setup before reassembly.";
  if (/door|panel|cover|backsplash|cap/.test(label)) return "Check the photos for mounting tabs, screw points, and cosmetic edges so you know it matches the piece you are replacing.";
  if (/drum|bearing|slide|glide/.test(label)) return "Confirm the wear surfaces and support points match your original part before installation.";
  return "Confirm the diagram callout and wear points against your original part before installation.";
}

function htmlForEbayDescription({ title, record, phase1a, phase1c, routing, attachedImages, relativeImages, imageStatus, price }) {
  const badgeClass = routing.hitl_review_required ? "review" : "ready";
  const badgeText = routing.hitl_review_required
    ? `NEEDS HITL REVIEW - confidence ${routing.confidence_score.toFixed(2)}`
    : `LOCAL REVIEW READY - confidence ${routing.confidence_score.toFixed(2)}`;
  const photosHtml = relativeImages.length
    ? `<div class="photos">${relativeImages.map((image) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(record.partNumber)} part photo">`).join("")}</div>`
    : `<div class="pending">PART PHOTO PENDING - do not stage this listing until actual approved sale photos are attached.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;line-height:1.55;margin:0;background:#f6f7f9;padding:20px}
    .wrap{max-width:860px;margin:auto;background:#fff;border:1px solid #ddd}
    .brand{background:#162033;color:#fff;padding:18px 22px;font-weight:800;letter-spacing:.04em}
    .brand span{color:#4ea1ff}
    .content{padding:24px}
    h1{font-size:24px;margin:0 0 14px;color:#162033}
    .badge{display:inline-block;font-weight:800;border:1px solid currentColor;padding:6px 10px;margin-bottom:18px}
    .badge.ready{background:#ecfdf5;color:#065f46}
    .badge.review{background:#fffbeb;color:#92400e}
    table{border-collapse:collapse;width:100%;margin:18px 0}
    th,td{border:1px solid #e5e7eb;padding:10px;text-align:left}
    th{background:#f9fafb;width:180px}
    h2{font-size:18px;margin-top:24px}
    .note{background:#eef6ff;border-left:4px solid #2563eb;padding:14px}
    .terms{background:#f9fafb;border-left:4px solid #162033;padding:14px}
    .photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0}
    .photos img{width:100%;aspect-ratio:1;object-fit:contain;border:1px solid #e5e7eb;background:#f9fafb}
    .pending{border:2px dashed #f59e0b;background:#fffbeb;color:#92400e;padding:18px;font-weight:800}
    .validation{background:#f8fafc;border:1px solid #e5e7eb;padding:14px;color:#4b5563;font-size:14px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Roadrunner<span>Parts</span></div>
    <div class="content">
      <h1>${escapeHtml(title)}</h1>
      <div class="badge ${badgeClass}">${escapeHtml(badgeText)}</div>
      <h2>Part Photos For Sale</h2>
      ${photosHtml}
      <table><tbody>
        <tr><th>Part Number</th><td>${escapeHtml(phase1a.PART_ID.OEM_Part_Number)}</td></tr>
        <tr><th>Part Label</th><td>${escapeHtml(phase1a.PART_ID.Part_Name)}</td></tr>
        <tr><th>Diagram Callout</th><td>${escapeHtml(phase1a.PART_ID.Diagram_Item_Number)}</td></tr>
        <tr><th>Donor Machine</th><td>${escapeHtml(DONOR_MACHINE_ID.Brand)} ${escapeHtml(DONOR_MACHINE_ID.Model_Number)}</td></tr>
        <tr><th>Donor Serial</th><td>${escapeHtml(DONOR_MACHINE_ID.Serial_Number)}</td></tr>
        <tr><th>Diagram Section</th><td>${escapeHtml(phase1a.PART_ID.Assembly_Diagram_Section)}</td></tr>
        <tr><th>Condition</th><td>${escapeHtml(record.specs?.condition || "Used")}</td></tr>
        <tr><th>Buy It Now</th><td>${escapeHtml(formatMoney(price))}</td></tr>
        <tr><th>Photo Gate</th><td>${escapeHtml(imageStatus)} (${attachedImages.length} approved local files)</td></tr>
      </tbody></table>
      <h2>The Part</h2>
      <ul>
        <li>Part number lock: ${escapeHtml(phase1a.PART_ID.OEM_Part_Number)}</li>
        <li>Diagram callout lock: ${escapeHtml(phase1a.PART_ID.Diagram_Item_Number)}</li>
        <li>Compatibility is limited to the donor record ${escapeHtml(DONOR_MACHINE_ID.Model_Number)} / ${escapeHtml(DONOR_MACHINE_ID.Serial_Number)} unless separately verified.</li>
      </ul>
      <h2>Condition</h2>
      <p>Used appliance part removed from a teardown unit. Exact testing notes were not supplied in the input evidence. Match the part number, diagram callout, and listing photos before ordering.</p>
      <h2>Tech Tip</h2>
      <div class="note">${escapeHtml(phase1c.techNote)}</div>
      <h2>Internal Validation Evidence</h2>
      <div class="validation">
        Donor/nameplate and diagram evidence validate identity only. They are not sale photos and must not be uploaded as eBay listing images.<br>
        Donor: ${escapeHtml(DONOR_MACHINE_ID.Brand)} ${escapeHtml(DONOR_MACHINE_ID.Model_Number)} / Serial ${escapeHtml(DONOR_MACHINE_ID.Serial_Number)}.<br>
        Diagram: ${escapeHtml(phase1a.PART_ID.Assembly_Diagram_Section)} / Callout ${escapeHtml(phase1a.PART_ID.Diagram_Item_Number)}.
      </div>
      <h2>Terms</h2>
      <div class="terms">Items ship within 1 business day. 30-day returns on uninstalled parts.</div>
    </div>
  </div>
</body>
</html>`;
}

function readableTable(rows) {
  return `<table><tbody>${rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? "")}</td></tr>`)
    .join("")}</tbody></table>`;
}

function readableList(values) {
  const items = values.filter(Boolean);
  if (!items.length) return `<p class="muted">No values captured.</p>`;
  return `<ul>${items.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function sourceDescriptionReadable(records) {
  if (!records.length) {
    return `<p class="muted">No source-backed product description block has been captured for this part yet.</p>`;
  }

  return records
    .map(
      (record) => `
        <div class="read-block">
          ${readableTable([
            ["Source", record.source],
            ["Evidence Type", record.evidenceType],
            ["Identity Match", record.identityMatch],
            ["Product Page", record.pageUrl],
            ["URL Source", record.pageUrlSource],
            ["Selector", record.selector],
            ["Captured", record.capturedAt],
            ["Use Policy", record.listingUsePolicy],
          ])}
          <h3>Captured Description Text</h3>
          <pre class="plain-text">${escapeHtml(record.descriptionText)}</pre>
        </div>`,
    )
    .join("");
}

function sourceImageReadable(records) {
  if (!records.length) {
    return `<p class="muted">No ReliableParts image evidence has been captured for this part yet.</p>`;
  }

  return records
    .map((record) => {
      const candidates = Array.isArray(record.candidates) ? record.candidates : [];
      const imagesHtml = candidates.length
        ? `<div class="image-grid">${candidates
            .map(
              (candidate) => `
                <div class="image-card" data-image-url="${escapeHtml(candidate.imageUrl)}">
                  <a href="${escapeHtml(candidate.imageUrl)}" target="_blank" rel="noreferrer">
                    <img src="${escapeHtml(candidate.thumbnailUrl || candidate.imageUrl)}" alt="${escapeHtml(candidate.alt || record.partNumber)}">
                  </a>
                  <span class="image-state" data-image-state>Unreviewed</span>
                  <small>${escapeHtml(candidate.reviewStatus || record.reviewStatus)}</small>
                  <div class="image-actions">
                    <button type="button" class="image-keep" data-image-decision="keep">Keep</button>
                    <button type="button" class="image-trash" data-image-decision="trash">Trash</button>
                    <button type="button" class="image-clear" data-image-decision="clear">Clear</button>
                  </div>
                </div>`,
            )
            .join("")}</div>`
        : `<p class="muted">No candidate image URLs captured.</p>`;

      return `
        <div class="read-block">
          ${readableTable([
            ["Source", record.source],
            ["Evidence Type", record.evidenceType],
            ["Identity Match", record.identityMatch],
            ["Product Page", record.pageUrl],
            ["URL Source", record.pageUrlSource],
            ["Captured", record.capturedAt],
            ["Review Status", record.reviewStatus],
            ["Use Policy", record.listingUsePolicy],
          ])}
          ${imagesHtml}
        </div>`;
    })
    .join("");
}

function reviewPage(payload) {
  const routing = payload.system_routing;
  const p1a = payload.phase1a.PART_ID;
  const compatibility = payload.phase1a.COMPATIBILITY_ID || {};
  const donor = payload.phase0.DONOR_MACHINE_ID || {};
  const phase1b = payload.phase1b || {};
  const phase1c = payload.phase1c || {};
  const ebayPayload = payload.ebay_listing_payload || {};
  const itemSpecifics = ebayPayload.itemSpecifics || {};
  const pricing = ebayPayload.pricing || {};
  const sourceDescriptions = Array.isArray(payload.source_description_evidence)
    ? payload.source_description_evidence
    : [];
  const sourceImages = Array.isArray(payload.source_image_evidence) ? payload.source_image_evidence : [];
  const reviewSeed = {
    partNumber: p1a.OEM_Part_Number,
    title: payload.ebay_listing_payload.title,
    fileName: payload.fileName,
    modelRouting: routing.hitl_review_required ? "hitl_review" : "review_ready",
    photoGate: payload.ebay_listing_payload.imageStatus,
    modelTechNote: payload.phase1c.techNote,
  };
  const imageCandidates = payload.image_candidates || [];
  const candidatesHtml = imageCandidates.length
    ? imageCandidates
        .slice(0, 6)
        .map((candidate) => `<li><a href="${escapeHtml(candidate.pageUrl || candidate.imageUrl || "#")}">${escapeHtml(candidate.sourceDomain || "candidate")}</a> - ${escapeHtml(candidate.reviewStatus || "needs operator review")}</li>`)
        .join("")
    : "<li>No image candidates in normalized artifact.</li>";
  const donorReadable = readableTable([
    ["Brand", donor.Brand],
    ["Model", donor.Model_Number],
    ["Serial", donor.Serial_Number],
    ["Type", donor.Type],
    ["Session", donor.Session_ID],
  ]);
  const phase1aReadable = readableTable([
    ["Part Number", p1a.OEM_Part_Number],
    ["Part Name", p1a.Part_Name],
    ["Diagram Section", p1a.Assembly_Diagram_Section],
    ["Diagram Callout", p1a.Diagram_Item_Number],
    ["Diagram Image", p1a.Assembly_Diagram_Image],
    ["Included Hardware", p1a.Included_Hardware],
    ["Provenance", compatibility.Provenance],
    ["Confidence", routing.confidence_score.toFixed(2)],
    ["HITL Required", routing.hitl_review_required ? "Yes" : "No"],
    ["Flag Reason", routing.flag_reason || "None"],
  ]);
  const phase1bReadable = `
    <div class="read-block">
      <h3>${escapeHtml(phase1b.title || ebayPayload.title || "Untitled listing")}</h3>
      <pre class="plain-text">${escapeHtml(phase1b.description || "No baseline description captured.")}</pre>
    </div>`;
  const phase1cReadable = `
    <div class="read-block">
      <h3>Tech Tip</h3>
      <p>${escapeHtml(phase1c.techNote || "No tech tip captured.")}</p>
      <h3>Delta Scope</h3>
      <p>${escapeHtml(phase1c.deltaScope || "No delta scope captured.")}</p>
    </div>`;
  const sourceDescriptionBlock = sourceDescriptionReadable(sourceDescriptions);
  const sourceImageBlock = sourceImageReadable(sourceImages);
  const ebayReadable = `
    ${readableTable([
      ["Title", ebayPayload.title],
      ["Category", ebayPayload.categoryId],
      ["Condition", ebayPayload.condition],
      ["Format", ebayPayload.format],
      ["Buy It Now", pricing.buyItNowPrice ? `$${pricing.buyItNowPrice}` : ""],
      ["Minimum Offer", pricing.minimumOfferPrice ? `$${pricing.minimumOfferPrice}` : ""],
      ["Photo Gate", ebayPayload.imageStatus],
      ["Attached Images", Array.isArray(ebayPayload.attachedImages) ? ebayPayload.attachedImages.length : 0],
    ])}
    <h3>Item Specifics</h3>
    ${readableTable(Object.entries(itemSpecifics))}
    <h3>Attached Images</h3>
    ${readableList(Array.isArray(ebayPayload.attachedImages) ? ebayPayload.attachedImages : [])}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.ebay_listing_payload.title)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f4f6f8;color:#111827}
    header{background:#111827;color:white;padding:18px 24px}
    header a{color:#93c5fd}
    main{max-width:1120px;margin:0 auto;padding:22px;display:grid;gap:18px}
    section{background:white;border:1px solid #d8dee9;padding:16px}
    h1{font-size:22px;margin:0 0 6px}
    h2{font-size:16px;margin:0 0 12px}
    h3{font-size:14px;margin:16px 0 8px}
    pre{white-space:pre-wrap;overflow:auto;background:#0f172a;color:#e5e7eb;padding:12px}
    .plain-text{background:#f8fafc;color:#111827;border:1px solid #e5e7eb}
    .json-view{display:none}
    body.show-json .json-view{display:block}
    body.show-json .readable-view{display:none}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    .stat{border:1px solid #e5e7eb;padding:12px;background:#f9fafb}
    .ready{border-left:5px solid #16a34a}
    .review{border-left:5px solid #f59e0b}
    iframe{width:100%;height:720px;border:1px solid #cbd5e1;background:white}
    table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #e5e7eb;padding:8px;text-align:left}
    label{display:block;font-weight:700;margin:10px 0 6px}
    select,textarea,button{font:inherit}
    textarea{width:100%;min-height:150px;box-sizing:border-box;border:1px solid #cbd5e1;padding:10px;resize:vertical}
    select{border:1px solid #cbd5e1;padding:8px 10px;background:white}
    button{border:1px solid #111827;background:#111827;color:white;padding:9px 12px;font-weight:800;cursor:pointer}
    button.secondary{background:white;color:#111827}
    .view-toggle{margin-top:12px;display:flex;align-items:center;gap:10px;color:white;font-weight:800}
    .view-toggle input{position:absolute;opacity:0}
    .view-toggle .switch-ui{background:#475569}
    .view-toggle input:checked + .switch-ui{background:#2563eb}
    .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .shards{background:#f8fafc;border:1px solid #e5e7eb;padding:12px;margin-top:12px}
    .shards li{margin:6px 0}
    .muted{color:#6b7280}
    .switch-row{display:flex;align-items:center;gap:10px;font-weight:800;margin:12px 0 0}
    .switch-row input{position:absolute;opacity:0}
    .switch-ui{width:44px;height:24px;border-radius:999px;background:#cbd5e1;position:relative;display:inline-block;transition:.15s}
    .switch-ui:before{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:white;left:3px;top:3px;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
    .switch-row input:checked + .switch-ui{background:#16a34a}
    .switch-row input:checked + .switch-ui:before{transform:translateX(20px)}
    .image-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:12px}
    .image-card{display:flex;flex-direction:column;gap:6px;color:#111827;border:1px solid #e5e7eb;background:#f8fafc;padding:8px}
    .image-card.is-kept{background:#ecfdf5;border-color:#22c55e}
    .image-card.is-trashed{background:#fef2f2;border-color:#ef4444;opacity:.55}
    .image-card img{width:100%;aspect-ratio:1;object-fit:contain;background:white;border:1px solid #e5e7eb}
    .image-card span,.image-card small{font-size:11px;font-weight:800;color:#92400e}
    .image-card.is-kept .image-state{color:#166534}
    .image-card.is-trashed .image-state{color:#991b1b}
    .image-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
    .image-actions button{padding:6px 4px;font-size:11px}
    .image-actions .image-keep{background:#166534;border-color:#166534}
    .image-actions .image-trash{background:#991b1b;border-color:#991b1b}
    .image-actions .image-clear{background:white;color:#111827;border-color:#9ca3af}
    .image-summary{background:#f8fafc;border:1px solid #e5e7eb;padding:10px;margin:10px 0;font-weight:800}
  </style>
</head>
<body>
  <header>
    <a href="index.html">Back to chain index</a>
    <h1>${escapeHtml(payload.ebay_listing_payload.title)}</h1>
    <div>${routing.hitl_review_required ? "Needs HITL Review" : "Review Ready"} / ${escapeHtml(payload.ebay_listing_payload.imageStatus)}</div>
    <label class="view-toggle" for="jsonMode">
      <input id="jsonMode" type="checkbox">
      <span class="switch-ui" aria-hidden="true"></span>
      <span>Show JSON</span>
    </label>
  </header>
  <main>
    <section class="${routing.hitl_review_required ? "review" : "ready"}">
      <h2>Prompt Chain Routing</h2>
      <div class="grid">
        <div class="stat"><strong>Part</strong><br>${escapeHtml(p1a.OEM_Part_Number)}</div>
        <div class="stat"><strong>Phase 1A Confidence</strong><br>${routing.confidence_score.toFixed(2)}</div>
        <div class="stat"><strong>HITL</strong><br>${routing.hitl_review_required ? "Required" : "No"}</div>
        <div class="stat"><strong>Photo Gate</strong><br>${escapeHtml(payload.ebay_listing_payload.imageStatus)}</div>
      </div>
      <p>${escapeHtml(routing.flag_reason)}</p>
    </section>
    <section>
      <h2>Phase 0 - Donor Machine Lock</h2>
      <div class="readable-view">${donorReadable}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(payload.phase0, null, 2))}</pre>
    </section>
    <section>
      <h2>Phase 1A - Part Extraction Lock</h2>
      <div class="readable-view">${phase1aReadable}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(payload.phase1a, null, 2))}</pre>
    </section>
    <section>
      <h2>Phase 1B - Baseline Listing</h2>
      <div class="readable-view">${phase1bReadable}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(payload.phase1b, null, 2))}</pre>
    </section>
    <section>
      <h2>Phase 1C - Trust Shard Delta</h2>
      <div class="readable-view">${phase1cReadable}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(payload.phase1c, null, 2))}</pre>
    </section>
    <section>
      <h2>Source Description Evidence</h2>
      <p class="muted">Distributor text is evidence for operator review only. Rewrite it in Roadrunner wording before any live listing use.</p>
      <div class="readable-view">${sourceDescriptionBlock}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(sourceDescriptions, null, 2))}</pre>
    </section>
    <section>
      <h2>ReliableParts Image Evidence</h2>
      <p class="muted">These are source image candidates only. They are not approved sale photos and require watermark/use-rights review.</p>
      <div id="imageReviewSummary" class="image-summary">No image choices saved yet.</div>
      <div class="readable-view">${sourceImageBlock}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(sourceImages, null, 2))}</pre>
    </section>
    <section>
      <h2>Operator Reply And Memory Shards</h2>
      <p class="muted">Use <strong>&lt;shard&gt;reminder or hint&lt;/shard&gt;</strong> anywhere in the reply. Mark correct to reinforce the behavior, or incorrect to redirect model attention.</p>
      <label for="operatorVerdict">Review Result</label>
      <select id="operatorVerdict">
        <option value="correct">Model correct - reinforce this skill</option>
        <option value="incorrect">Model incorrect - adjust attention</option>
        <option value="photo_gate">Photo or evidence gate issue</option>
        <option value="hold">Hold for later</option>
      </select>
      <label class="switch-row" for="quickReviewed">
        <input id="quickReviewed" type="checkbox">
        <span class="switch-ui" aria-hidden="true"></span>
        <span>Reviewed</span>
      </label>
      <label for="operatorReply">Operator Reply</label>
      <textarea id="operatorReply" spellcheck="true"></textarea>
      <div class="actions">
        <button id="saveReview" type="button">Save Reply</button>
        <button id="copyReview" class="secondary" type="button">Copy JSON</button>
        <button id="clearReview" class="secondary" type="button">Clear</button>
      </div>
      <div class="shards">
        <strong>Extracted Shards</strong>
        <ul id="shardList"><li class="muted">No shards saved yet.</li></ul>
      </div>
      <pre id="reviewJson">{}</pre>
    </section>
    <section>
      <h2>eBay Payload</h2>
      <div class="readable-view">${ebayReadable}</div>
      <pre class="json-view">${escapeHtml(JSON.stringify(payload.ebay_listing_payload, null, 2))}</pre>
    </section>
    <section>
      <h2>Image Candidates For Operator Review</h2>
      <ul>${candidatesHtml}</ul>
    </section>
    <section>
      <h2>Rendered Item Description</h2>
      <iframe srcdoc="${escapeHtml(payload.ebay_listing_payload.description)}"></iframe>
    </section>
  </main>
  <script id="reviewSeed" type="application/json">${escapeHtml(JSON.stringify(reviewSeed))}</script>
  <script>
    (function () {
      var seed = JSON.parse(document.getElementById("reviewSeed").textContent);
      var storageKey = "rrp-ebay-review:" + seed.partNumber;
      var imageStorageKey = "rrp-ebay-image-review:" + seed.partNumber;
      var jsonModeEl = document.getElementById("jsonMode");
      var replyEl = document.getElementById("operatorReply");
      var verdictEl = document.getElementById("operatorVerdict");
      var reviewedEl = document.getElementById("quickReviewed");
      var shardListEl = document.getElementById("shardList");
      var jsonEl = document.getElementById("reviewJson");
      var imageSummaryEl = document.getElementById("imageReviewSummary");

      function extractShards(text) {
        var shards = [];
        var pattern = /<shard>([\\s\\S]*?)(?:<\\/shard>|<shard>)/gi;
        var match;
        while ((match = pattern.exec(text || ""))) {
          var value = match[1].trim();
          if (value) shards.push(value);
        }
        return shards;
      }

      function setJsonMode(enabled) {
        document.body.classList.toggle("show-json", enabled);
        localStorage.setItem("rrp-ebay-json-mode", enabled ? "true" : "false");
      }

      function loadImageDecisions() {
        try {
          return JSON.parse(localStorage.getItem(imageStorageKey) || "{}");
        } catch {
          return {};
        }
      }

      function saveImageDecision(imageUrl, decision) {
        var decisions = loadImageDecisions();
        if (decision === "clear") delete decisions[imageUrl];
        else decisions[imageUrl] = {
          decision: decision,
          imageUrl: imageUrl,
          partNumber: seed.partNumber,
          title: seed.title,
          fileName: seed.fileName,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(imageStorageKey, JSON.stringify(decisions));
        var index = JSON.parse(localStorage.getItem("rrp-ebay-image-review-index") || "[]");
        if (index.indexOf(seed.partNumber) === -1) index.push(seed.partNumber);
        localStorage.setItem("rrp-ebay-image-review-index", JSON.stringify(index.sort()));
        renderImageDecisions();
      }

      function renderImageDecisions() {
        var decisions = loadImageDecisions();
        var kept = 0;
        var trashed = 0;
        document.querySelectorAll("[data-image-url]").forEach(function (card) {
          var imageUrl = card.getAttribute("data-image-url");
          var record = decisions[imageUrl];
          var decision = record && record.decision;
          card.classList.toggle("is-kept", decision === "keep");
          card.classList.toggle("is-trashed", decision === "trash");
          var state = card.querySelector("[data-image-state]");
          if (decision === "keep") {
            kept += 1;
            if (state) state.textContent = "Kept";
          } else if (decision === "trash") {
            trashed += 1;
            if (state) state.textContent = "Trashed";
          } else if (state) {
            state.textContent = "Unreviewed";
          }
        });
        if (imageSummaryEl) {
          imageSummaryEl.textContent = "Image choices: " + kept + " kept / " + trashed + " trashed";
        }
      }

      function buildRecord() {
        var reply = replyEl.value || "";
        return {
          partNumber: seed.partNumber,
          title: seed.title,
          fileName: seed.fileName,
          verdict: verdictEl.value,
          reviewed: reviewedEl.checked,
          operatorReply: reply,
          shards: extractShards(reply),
          modelRouting: seed.modelRouting,
          photoGate: seed.photoGate,
          modelTechNote: seed.modelTechNote,
          updatedAt: new Date().toISOString()
        };
      }

      function render(record) {
        shardListEl.innerHTML = "";
        if (!record.shards.length) {
          var empty = document.createElement("li");
          empty.className = "muted";
          empty.textContent = "No <shard> blocks found yet.";
          shardListEl.appendChild(empty);
        } else {
          record.shards.forEach(function (shard) {
            var li = document.createElement("li");
            li.textContent = shard;
            shardListEl.appendChild(li);
          });
        }
        jsonEl.textContent = JSON.stringify(record, null, 2);
        reviewedEl.checked = Boolean(record.reviewed);
      }

      function save() {
        var record = buildRecord();
        localStorage.setItem(storageKey, JSON.stringify(record));
        var index = JSON.parse(localStorage.getItem("rrp-ebay-review-index") || "[]");
        if (index.indexOf(seed.partNumber) === -1) index.push(seed.partNumber);
        localStorage.setItem("rrp-ebay-review-index", JSON.stringify(index.sort()));
        render(record);
      }

      var existing = localStorage.getItem(storageKey);
      if (existing) {
        try {
          var parsed = JSON.parse(existing);
          replyEl.value = parsed.operatorReply || "";
          verdictEl.value = parsed.verdict || "correct";
          reviewedEl.checked = Boolean(parsed.reviewed);
          render(parsed);
        } catch {
          render(buildRecord());
        }
      } else {
        render(buildRecord());
      }

      jsonModeEl.checked = localStorage.getItem("rrp-ebay-json-mode") === "true";
      setJsonMode(jsonModeEl.checked);
      jsonModeEl.addEventListener("change", function () {
        setJsonMode(jsonModeEl.checked);
      });

      replyEl.addEventListener("input", function () { render(buildRecord()); });
      verdictEl.addEventListener("change", function () { render(buildRecord()); });
      reviewedEl.addEventListener("change", save);
      document.querySelectorAll("[data-image-decision]").forEach(function (button) {
        button.addEventListener("click", function () {
          var card = button.closest("[data-image-url]");
          if (!card) return;
          saveImageDecision(card.getAttribute("data-image-url"), button.getAttribute("data-image-decision"));
        });
      });
      document.getElementById("saveReview").addEventListener("click", save);
      document.getElementById("copyReview").addEventListener("click", function () {
        navigator.clipboard.writeText(JSON.stringify(buildRecord(), null, 2));
      });
      document.getElementById("clearReview").addEventListener("click", function () {
        localStorage.removeItem(storageKey);
        replyEl.value = "";
        verdictEl.value = "correct";
        render(buildRecord());
      });
      renderImageDecisions();
    })();
  </script>
</body>
</html>`;
}

function indexPage({ listings, generatedAt, promptSummary }) {
  const hitl = listings.filter((item) => item.system_routing.hitl_review_required).length;
  const ready = listings.length - hitl;
  const attached = listings.filter((item) => item.ebay_listing_payload.imageStatus === "part_photos_attached").length;
  const pending = listings.length - attached;
  const sourceDescriptions = listings.filter((item) => item.source_description_evidence?.length).length;
  const sourceImages = listings.filter((item) => item.source_image_evidence?.length).length;
  const cards = listings
    .map((item) => {
      const cls = item.system_routing.hitl_review_required ? "review" : "ready";
      const p1a = item.phase1a.PART_ID;
      const seed = {
        partNumber: p1a.OEM_Part_Number,
        title: item.ebay_listing_payload.title,
        fileName: item.fileName,
        modelRouting: item.system_routing.hitl_review_required ? "hitl_review" : "review_ready",
        photoGate: item.ebay_listing_payload.imageStatus,
        modelTechNote: item.phase1c.techNote,
      };
      const descriptionStatus = item.source_description_evidence?.length
        ? "source description captured"
        : "no source description";
      const sourceImageStatus = item.source_image_evidence?.length ? "source images captured" : "no source images";
      return `<article class="card ${cls}" data-card="${escapeHtml(p1a.OEM_Part_Number)}" data-seed="${escapeHtml(JSON.stringify(seed))}">
        <a class="card-link" href="${escapeHtml(item.fileName)}">
          <strong>${escapeHtml(p1a.OEM_Part_Number)}</strong>
          <span>${escapeHtml(item.ebay_listing_payload.title)}</span>
          <em>${item.system_routing.hitl_review_required ? "HITL" : "Ready"} / ${escapeHtml(item.ebay_listing_payload.imageStatus)}</em>
          <em>${escapeHtml(descriptionStatus)}</em>
          <em>${escapeHtml(sourceImageStatus)}</em>
        </a>
        <div class="card-review">
          <small data-review-state="${escapeHtml(p1a.OEM_Part_Number)}">No operator reply saved</small>
          <label class="switch-row" for="toggle-${escapeHtml(p1a.OEM_Part_Number)}">
            <input id="toggle-${escapeHtml(p1a.OEM_Part_Number)}" type="checkbox" data-review-toggle="${escapeHtml(p1a.OEM_Part_Number)}">
            <span class="switch-ui" aria-hidden="true"></span>
            <span data-toggle-label="${escapeHtml(p1a.OEM_Part_Number)}">Reviewed</span>
          </label>
        </div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RoadrunnerParts eBay Automation Prompt Chain</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f4f6f8;color:#111827}
    header{background:#111827;color:white;padding:24px}
    h1{margin:0 0 10px;font-size:28px}
    .stats{display:flex;flex-wrap:wrap;gap:10px}
    .stat{background:#1f2937;border:1px solid #374151;padding:10px 12px}
    main{padding:20px;max-width:1280px;margin:0 auto}
    .prompt{background:white;border:1px solid #d8dee9;padding:14px;margin-bottom:18px}
    pre{white-space:pre-wrap;background:#0f172a;color:#e5e7eb;padding:12px;overflow:auto}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
    .card{display:flex;flex-direction:column;gap:10px;background:white;border:1px solid #d8dee9;padding:14px;color:#111827}
    .card:hover{border-color:#2563eb}
    .card.is-reviewed{background:#f0fdf4;border-color:#86efac}
    .card.ready{border-left:5px solid #16a34a}
    .card.review{border-left:5px solid #f59e0b}
    .card-link{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:#111827}
    .card strong{font-size:18px}
    .card span{color:#4b5563}
    .card small{color:#6b7280;font-weight:700}
    .card em{font-style:normal;font-size:12px;font-weight:800;color:#2563eb}
    .card-review{border-top:1px solid #e5e7eb;padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .switch-row{display:flex;align-items:center;gap:8px;font-weight:800;cursor:pointer;white-space:nowrap}
    .switch-row input{position:absolute;opacity:0}
    .switch-ui{width:42px;height:24px;border-radius:999px;background:#cbd5e1;position:relative;display:inline-block;transition:.15s}
    .switch-ui:before{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:white;left:3px;top:3px;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
    .switch-row input:checked + .switch-ui{background:#16a34a}
    .switch-row input:checked + .switch-ui:before{transform:translateX(18px)}
    button{border:1px solid #111827;background:#111827;color:white;padding:9px 12px;font-weight:800;cursor:pointer}
    .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  </style>
</head>
<body>
  <header>
    <h1>RoadrunnerParts eBay Automation Prompt Chain</h1>
    <div class="stats">
      <div class="stat">${listings.length} listings processed</div>
      <div class="stat">${ready} review ready</div>
      <div class="stat">${hitl} HITL review</div>
      <div class="stat">${attached} approved photo attached</div>
      <div class="stat">${pending} photo pending</div>
      <div class="stat">${sourceDescriptions} source descriptions</div>
      <div class="stat">${sourceImages} source image sets</div>
      <div class="stat">liveEbaySync: false</div>
      <div class="stat">Generated: ${escapeHtml(generatedAt)}</div>
    </div>
  </header>
  <main>
    <section class="prompt">
      <h2>Prompt Chain Guardrails</h2>
      <pre>${escapeHtml(promptSummary || "Prompt summary unavailable.")}</pre>
    </section>
    <section class="prompt">
      <h2>Operator Shard Export</h2>
      <p>Replies and image keep/trash decisions are stored in this browser. Use this export after reviewing the current listing pages.</p>
      <div class="actions">
        <button id="exportReviews" type="button">Download Review JSON</button>
      </div>
      <pre id="reviewSummary">No saved replies loaded yet.</pre>
    </section>
    <div class="grid">${cards}</div>
  </main>
  <script>
    (function () {
      function loadReviews() {
        var records = [];
        for (var i = 0; i < localStorage.length; i += 1) {
          var key = localStorage.key(i);
          if (!key || key.indexOf("rrp-ebay-review:") !== 0) continue;
          try { records.push(JSON.parse(localStorage.getItem(key))); } catch {}
        }
        records.sort(function (a, b) { return String(a.partNumber).localeCompare(String(b.partNumber)); });
        return records;
      }

      function loadImageReviews() {
        var records = [];
        for (var i = 0; i < localStorage.length; i += 1) {
          var key = localStorage.key(i);
          if (!key || key.indexOf("rrp-ebay-image-review:") !== 0) continue;
          var partNumber = key.replace("rrp-ebay-image-review:", "");
          try {
            var decisions = JSON.parse(localStorage.getItem(key) || "{}");
            Object.keys(decisions).forEach(function (imageUrl) {
              records.push(decisions[imageUrl]);
            });
          } catch {}
        }
        records.sort(function (a, b) {
          return String(a.partNumber).localeCompare(String(b.partNumber)) || String(a.imageUrl).localeCompare(String(b.imageUrl));
        });
        return records;
      }

      function storageKey(partNumber) {
        return "rrp-ebay-review:" + partNumber;
      }

      function defaultVerdict(seed) {
        if (seed.photoGate !== "part_photos_attached") return "photo_gate";
        if (seed.modelRouting === "hitl_review") return "hold";
        return "correct";
      }

      function saveQuickReview(seed, reviewed) {
        if (!reviewed) {
          localStorage.removeItem(storageKey(seed.partNumber));
          renderSummary();
          return;
        }

        var record = {
          partNumber: seed.partNumber,
          title: seed.title,
          fileName: seed.fileName,
          verdict: defaultVerdict(seed),
          reviewed: true,
          operatorReply: "Quick index toggle review.",
          shards: [],
          modelRouting: seed.modelRouting,
          photoGate: seed.photoGate,
          modelTechNote: seed.modelTechNote,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(storageKey(seed.partNumber), JSON.stringify(record));
        var index = JSON.parse(localStorage.getItem("rrp-ebay-review-index") || "[]");
        if (index.indexOf(seed.partNumber) === -1) index.push(seed.partNumber);
        localStorage.setItem("rrp-ebay-review-index", JSON.stringify(index.sort()));
        renderSummary();
      }

      function renderSummary() {
        var records = loadReviews();
        var imageRecords = loadImageReviews();
        var shardCount = records.reduce(function (sum, record) { return sum + (record.shards || []).length; }, 0);
        document.querySelectorAll("[data-review-state]").forEach(function (node) {
          node.textContent = "No operator reply saved";
        });
        document.querySelectorAll("[data-review-toggle]").forEach(function (toggle) {
          toggle.checked = false;
        });
        document.querySelectorAll("[data-toggle-label]").forEach(function (label) {
          label.textContent = "Reviewed";
        });
        document.querySelectorAll("[data-card]").forEach(function (card) {
          card.classList.remove("is-reviewed");
        });
        document.getElementById("reviewSummary").textContent = JSON.stringify({
          savedReplies: records.length,
          extractedShards: shardCount,
          correct: records.filter(function (record) { return record.verdict === "correct"; }).length,
          incorrect: records.filter(function (record) { return record.verdict === "incorrect"; }).length,
          photoGate: records.filter(function (record) { return record.verdict === "photo_gate"; }).length,
          imageKept: imageRecords.filter(function (record) { return record.decision === "keep"; }).length,
          imageTrashed: imageRecords.filter(function (record) { return record.decision === "trash"; }).length,
          imageDecisions: imageRecords.length
        }, null, 2);
        records.forEach(function (record) {
          var node = document.querySelector('[data-review-state="' + record.partNumber + '"]');
          if (node) node.textContent = "Reviewed: " + record.verdict + " / " + ((record.shards || []).length) + " shard(s)";
          var toggle = document.querySelector('[data-review-toggle="' + record.partNumber + '"]');
          if (toggle) toggle.checked = Boolean(record.reviewed || record.operatorReply || (record.shards || []).length);
          var label = document.querySelector('[data-toggle-label="' + record.partNumber + '"]');
          if (label) label.textContent = "Reviewed";
          var card = document.querySelector('[data-card="' + record.partNumber + '"]');
          if (card) card.classList.add("is-reviewed");
        });
      }

      document.querySelectorAll("[data-review-toggle]").forEach(function (toggle) {
        toggle.addEventListener("change", function () {
          var card = toggle.closest("[data-seed]");
          if (!card) return;
          var seed = JSON.parse(card.getAttribute("data-seed"));
          saveQuickReview(seed, toggle.checked);
        });
      });

      document.getElementById("exportReviews").addEventListener("click", function () {
        var records = loadReviews();
        var imageRecords = loadImageReviews();
        var payload = {
          exportedAt: new Date().toISOString(),
          source: "scratch/ebay-automation-chain local review UI",
          instructions: "Ingest shards and image decisions only after operator review. ReliableParts images remain candidates until kept and rights/watermark reviewed.",
          records: records,
          imageRecords: imageRecords
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "ebay-operator-review.json";
        a.click();
        URL.revokeObjectURL(url);
      });

      renderSummary();
    })();
  </script>
</body>
</html>`;
}

function buildPayload(
  record,
  index,
  legacyMap,
  approvedImageMap,
  descriptionEvidenceMap,
  imageEvidenceMap,
  localImageEvidenceMap,
) {
  const partNumber = String(record.partNumber || record.specs?.mpn || "").trim().toUpperCase();
  if (!partNumber) throw new Error(`Missing part number at listing index ${index}`);

  const legacyRecord = legacyMap.get(partNumber);
  const section = inferSection(record, legacyRecord);
  const diagram = DIAGRAMS[section];
  const callout = String(record.diagId || record.diagramId || record.specs?.diagramId || legacyRecord?.phase1a?.PART_ID?.Diagram_Item_Number || "").trim();
  const label = cleanPartLabel(record);
  const baseRouting = routeReview(record, legacyRecord);
  const title = makeTitle(record);
  const price = parseMoney(record.ebayBuyNow || record.price || record.specs?.ebayBuyNow, 25);
  const attachedImages = approvedImageMap.get(partNumber) || [];
  const relativeImages = attachedImages.map((imagePath) => path.relative(outputDir, imagePath).split(path.sep).join("/"));
  const imageStatus = attachedImages.length ? "part_photos_attached" : "part_photo_pending";
  const sourceDescriptionEvidence = descriptionEvidenceMap.has(partNumber)
    ? [descriptionEvidenceMap.get(partNumber)]
    : [];
  const sourceImageEvidence = [
    ...(imageEvidenceMap.has(partNumber) ? [imageEvidenceMap.get(partNumber)] : []),
    ...(localImageEvidenceMap.has(partNumber) ? [localImageEvidenceMap.get(partNumber)] : []),
  ];
  const routing = attachedImages.length
    ? baseRouting
    : {
        confidence_score: Math.min(Number(baseRouting.confidence_score || 0.82), 0.82),
        hitl_review_required: true,
        flag_reason: baseRouting.hitl_review_required
          ? `${baseRouting.flag_reason} Also blocked by photo gate: no approved sale photo is attached.`
          : "Photo gate blocked: no approved sale photo is attached, so this listing must stay in HITL review before staging.",
      };
  const techNote = techNoteFor(record);

  const phase1a = {
    PART_ID: {
      Diagram_Item_Number: callout || "UNSET",
      Assembly_Diagram_Section: section,
      Assembly_Diagram_Image: diagram.imageUrl,
      Part_Name: label,
      OEM_Part_Number: partNumber,
      Included_Hardware: "[X]",
    },
    COMPATIBILITY_ID: {
      Provenance: `Pulled directly from donor ${DONOR_MACHINE_ID.Brand} ${DONOR_MACHINE_ID.Model_Number} (Serial: ${DONOR_MACHINE_ID.Serial_Number}). Verify part number, diagram callout, and photos before ordering.`,
    },
    SYSTEM_ROUTING: {
      Confidence_Score: routing.confidence_score,
      HITL_Review_Required: routing.hitl_review_required,
      Flag_Reason: routing.flag_reason,
    },
  };

  const phase1bDescription = `Title: ${title}

The Part
- Part number: ${partNumber}
- Part label: ${label}
- Diagram callout: ${callout || "UNSET"}
- Donor model record: ${DONOR_MACHINE_ID.Brand} ${DONOR_MACHINE_ID.Model_Number} / Serial ${DONOR_MACHINE_ID.Serial_Number}
- Assembly diagram section: ${section}
- Included hardware: [X]
${sourceDescriptionEvidence.length ? "- Source product description: ReliableParts block captured for operator review only. Rewrite in Roadrunner wording before staging.\n" : ""}

Condition
- Used appliance part removed from a teardown unit.
- Exact testing notes were not supplied in the input evidence.
- Match the part number, diagram callout, and listing photos before ordering.

Tech Tip:
${techNote}

Terms
- Items ship within 1 business day.
- 30-day returns on uninstalled parts.
- Review routing: ${routing.hitl_review_required ? "Needs human review before staging." : "Eligible for local operator review."}`;

  const phase1b = {
    title,
    description: phase1bDescription,
    layout: ["Title", "The Part", "Condition", "Tech Tip", "Terms"],
  };

  const phase1c = {
    techNote,
    deltaScope: "Added one bounded Tech Tip without changing locked part number, title, diagram callout, donor provenance, condition, or policy terms.",
  };

  const ebayDescription = htmlForEbayDescription({
    title,
    record,
    phase1a,
    phase1c,
    routing,
    attachedImages,
    relativeImages,
    imageStatus,
    price,
  });

  const fileName = `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(partNumber)}.html`;

  return {
    api_version: "2026.05-local-review",
    session_id: `SESSION_${DONOR_MACHINE_ID.Model_Number}_${DONOR_MACHINE_ID.Serial_Number}`,
    source_chain: {
      prompt_pack: "LOCK-DRIVEN PARTS SYSTEM / eBay Automation Prompt Chain",
      input_listing_artifact: inputPath,
      prompt_contract: promptPath,
      nameplate_image: "C:/Users/bradv/Downloads/20260327_091311.jpg",
      diagram_root: "public/diagrams/HTDX100ED3WW",
      approved_part_image_root: approvedImageRoot,
      description_evidence_path: descriptionEvidencePath,
      image_evidence_path: imageEvidencePath,
      local_image_evidence_dir: localImageEvidenceDir,
      live_ebay_sync: false,
    },
    validationEvidence: {
      nameplateImage: "C:/Users/bradv/Downloads/20260327_091311.jpg",
      assemblyDiagram: {
        section,
        callout: callout || "UNSET",
        imagePath: diagram.imagePath,
        imageUrl: diagram.imageUrl,
      },
      sourceDescription: sourceDescriptionEvidence.map((evidence) => ({
        source: evidence.source,
        pageUrl: evidence.pageUrl,
        selector: evidence.selector,
        capturedAt: evidence.capturedAt,
        listingUsePolicy: evidence.listingUsePolicy,
      })),
    },
    phase0: {
      DONOR_MACHINE_ID,
    },
    phase1a,
    phase1b,
    phase1c,
    system_routing: routing,
    source_description_evidence: sourceDescriptionEvidence,
    source_image_evidence: sourceImageEvidence,
    image_candidates: Array.isArray(record.imageCandidates) ? record.imageCandidates : [],
    ebay_listing_payload: {
      title,
      categoryId: "20714",
      condition: record.specs?.condition || "Used",
      format: "FixedPrice",
      pricing: {
        buyItNowPrice: price,
        minimumOfferPrice: Math.round(price * 0.8 * 100) / 100,
      },
      itemSpecifics: {
        Brand: record.specs?.brand || "GE",
        Donor_Brand: DONOR_MACHINE_ID.Brand,
        Type: label,
        MPN: partNumber,
        UPC: "Does Not Apply",
        Donor_Model: DONOR_MACHINE_ID.Model_Number,
        Donor_Serial: DONOR_MACHINE_ID.Serial_Number,
        Diagram_Callout: callout || "UNSET",
        Diagram_Section: section,
      },
      shipping: {
        packageType: null,
        shippingService: null,
      },
      attachedImages,
      imageStatus,
      description: ebayDescription,
    },
    fileName,
  };
}

const listings = parseJsonWithListings(inputPath);
const legacyMap = loadLegacyMap(legacyChainPath);
const approvedImageMap = loadApprovedImages(approvedImageRoot);
const descriptionEvidenceMap = loadDescriptionEvidenceMap(descriptionEvidencePath);
const imageEvidenceMap = loadImageEvidenceMap(imageEvidencePath);
const localImageEvidenceMap = loadLocalImageEvidence(localImageEvidenceDir, listings);
const promptSummary = readPromptSummary(promptPath);
const generatedAt = new Date().toISOString();

fs.mkdirSync(outputDir, { recursive: true });

for (const entry of fs.readdirSync(outputDir)) {
  if (/^(index|chain-payloads|\d{3}-).*\.(html|json)$/.test(entry)) {
    fs.rmSync(path.join(outputDir, entry), { force: true });
  }
}

const payloads = listings.map((record, index) =>
  buildPayload(
    record,
    index,
    legacyMap,
    approvedImageMap,
    descriptionEvidenceMap,
    imageEvidenceMap,
    localImageEvidenceMap,
  ),
);

for (const payload of payloads) {
  fs.writeFileSync(path.join(outputDir, payload.fileName), reviewPage(payload));
}

const manifest = {
  generatedAt,
  inputPath,
  promptPath,
  promptPack: "LOCK-DRIVEN PARTS SYSTEM / eBay Automation Prompt Chain",
  liveEbaySync: false,
  counts: {
    listings: payloads.length,
    reviewReady: payloads.filter((item) => !item.system_routing.hitl_review_required).length,
    hitlReview: payloads.filter((item) => item.system_routing.hitl_review_required).length,
    approvedPhotosAttached: payloads.filter((item) => item.ebay_listing_payload.imageStatus === "part_photos_attached").length,
    partPhotoPending: payloads.filter((item) => item.ebay_listing_payload.imageStatus === "part_photo_pending").length,
    sourceDescriptions: payloads.filter((item) => item.source_description_evidence.length > 0).length,
    sourceImageSets: payloads.filter((item) => item.source_image_evidence.length > 0).length,
    localImageEvidenceSets: localImageEvidenceMap.size,
  },
  listings: payloads,
};

fs.writeFileSync(path.join(outputDir, "chain-payloads.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outputDir, "index.html"), indexPage({ listings: payloads, generatedAt, promptSummary }));

console.log(`Generated ${payloads.length} prompt-chain review pages in ${outputDir}`);
console.log(JSON.stringify(manifest.counts, null, 2));
