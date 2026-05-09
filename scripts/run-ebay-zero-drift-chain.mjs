import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const DEFAULT_INPUT = "scratch/ebay-html-final-52/listings.normalized.json";
const DEFAULT_SHEET = "scratch/revised ebay list.txt";
const DEFAULT_OUTPUT_DIR = "scratch/ebay-zero-drift-final-52";
const DEFAULT_DONOR_BOM = "C:/Users/bradv/Downloads/HTDX100ED3WW_ZA801821C_BOM.xlsx";
const DEFAULT_NAMEPLATE_IMAGE = "C:/Users/bradv/Downloads/20260327_091311.jpg";
const DEFAULT_DIAGRAM_ROOT = "public/diagrams/HTDX100ED3WW";
const DEFAULT_APPROVED_IMAGE_ROOT = "scratch/approved-images";
const FALLBACK_DONOR = {
  brand: "Hotpoint",
  modelNumber: "HTDX100ED3WW",
  serialNumber: "ZA801821C",
  applianceType: "Electric Dryer",
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const inputPath = String(args.get("input") || DEFAULT_INPUT);
const sheetPath = String(args.get("sheet") || DEFAULT_SHEET);
const outputDir = String(args.get("output-dir") || DEFAULT_OUTPUT_DIR);
const donorBomPath = String(args.get("donor-bom") || DEFAULT_DONOR_BOM);
const nameplateImagePath = String(args.get("nameplate-image") || DEFAULT_NAMEPLATE_IMAGE);
const diagramRoot = String(args.get("diagram-root") || DEFAULT_DIAGRAM_ROOT);
const approvedImageRoot = String(args.get("approved-image-root") || DEFAULT_APPROVED_IMAGE_ROOT);

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

function parseMoney(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.]+/g, ""));
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function parseSheet(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split("\t").map((header) =>
    header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""),
  );
  const rows = [];
  const byPartNumber = new Map();

  for (const line of lines) {
    const values = line.split("\t").map((value) => value.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    const normalized = {
      partNumber: row.partnumber,
      partTitle: row.parttitle,
      diagId: row.diagid,
      retail: row.retail,
      ebayBuyNow: row.ebaybuynow,
    };
    if (!normalized.partNumber) continue;
    rows.push(normalized);
    byPartNumber.set(normalized.partNumber.toUpperCase(), normalized);
  }

  return { rows, byPartNumber };
}

function normalizeSection(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function sectionToDiagramFile(section) {
  const normalized = normalizeSection(section);
  if (normalized === "BACKSPLASH, BLOWER & DRIVE ASSEMBLY") return "backsplash-blower-drive-assembly.png";
  if (normalized === "CABINET & TOP PANEL") return "cabinet-top-panel.png";
  if (normalized === "DRUM") return "drum.png";
  if (normalized === "FRONT PANEL & DOOR") return "front-panel-door.png";
  return "";
}

function toPublicDiagramUrl(fileName) {
  return fileName ? `/diagrams/HTDX100ED3WW/${fileName}` : "";
}

function toHtmlRelativePath(filePath, fromDir) {
  if (!filePath) return "";
  return path.relative(fromDir, filePath).split(path.sep).map(encodeURIComponent).join("/");
}

function loadApprovedPartPhotos(rootDir) {
  const photos = [];
  if (!rootDir || !fs.existsSync(rootDir)) return photos;

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
      if (!allowedExts.has(path.extname(entry.name).toLowerCase())) continue;

      photos.push(fullPath);
    }
  }

  return photos.sort((a, b) => a.localeCompare(b));
}

function findApprovedPartPhotos(partNumber, approvedPhotos) {
  const part = String(partNumber || "").trim().toUpperCase();
  if (!part) return [];
  return approvedPhotos.filter((photoPath) =>
    path.basename(photoPath).toUpperCase().includes(part),
  );
}

function loadDonorEvidence(filePath) {
  const donor = { ...FALLBACK_DONOR };
  const diagramByCallout = new Map();
  const source = {
    donorBomPath: filePath,
    donorBomFound: false,
    nameplateImagePath,
    nameplateImageFound: fs.existsSync(nameplateImagePath),
    diagramRoot,
  };

  if (!fs.existsSync(filePath)) {
    return { donor, diagramByCallout, source };
  }

  source.donorBomFound = true;
  const workbook = xlsx.readFile(filePath);
  const summarySheet = workbook.Sheets.Summary;
  if (summarySheet) {
    const summaryRows = xlsx.utils.sheet_to_json(summarySheet, { header: 1, defval: "" });
    for (const [field, value] of summaryRows) {
      const key = String(field || "").trim();
      if (key === "Model_Number" && value) donor.modelNumber = String(value).trim();
      if (key === "Serial_Number" && value) donor.serialNumber = String(value).trim();
      if (key === "Brand" && value) donor.brand = String(value).trim();
      if (key === "Type" && value) donor.applianceType = String(value).trim();
    }
  }

  const bomSheet = workbook.Sheets.BOM;
  if (bomSheet) {
    const rows = xlsx.utils.sheet_to_json(bomSheet, { defval: "" });
    for (const row of rows) {
      const callout = String(row.Dia_Id || row.Diag_ID || row.Diagram_ID || "").trim();
      const section = String(row.Assembly_section_Title || row.Assembly_Section || row.section || "").trim();
      if (!callout || !section || diagramByCallout.has(callout)) continue;
      const diagramFile = sectionToDiagramFile(section);
      diagramByCallout.set(callout, {
        assemblySection: section,
        diagramFile,
        diagramPath: diagramFile ? path.join(diagramRoot, diagramFile) : "",
        diagramUrl: toPublicDiagramUrl(diagramFile),
      });
    }
  }

  return { donor, diagramByCallout, source };
}

function loadListings(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const listings = Array.isArray(parsed) ? parsed : parsed.listings;
  if (!Array.isArray(listings)) {
    throw new Error(`No listings array found in ${filePath}`);
  }
  return listings;
}

function titleCaseToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bAsm\b/g, "Assembly")
    .replace(/\bCu\.Ft\b/g, "Cu.ft")
    .replace(/\bLh\b/g, "LH");
}

function classifyPart(partTitle) {
  const text = String(partTitle || "").toLowerCase();
  if (/thermostat|switch|fuse|resistor|strap|bracket|clamp|bearing|gasket|latch|screw|shaft|knob|term|terminal|holder|plug/.test(text)) {
    return {
      confidence: 0.82,
      hitl: true,
      reason: "Small or generic service part; verify against the physical item and diagram callout before listing.",
    };
  }
  if (/drum|motor|panel|door|backsplash|housing|wheel|screen|filter|duct|belt|cover|base|handle|element/.test(text)) {
    return {
      confidence: 0.95,
      hitl: false,
      reason: "Distinct part title and diagram callout are present in the operator sheet.",
    };
  }
  return {
    confidence: 0.9,
    hitl: true,
    reason: "Part type is not distinctive enough for zero-click routing from row data alone.",
  };
}

function buildTitle(row) {
  const cleanedTitle = titleCaseToken(row.partTitle)
    .replace(/\s+\(replacement\)$/i, "")
    .replace(/\s+\(original ge [^)]+\)$/i, "")
    .replace(/^GE\s+/i, "");
  const title = `GE ${row.partNumber} ${cleanedTitle} Used Dryer Part`;
  return title.length <= 80 ? title : `GE ${row.partNumber} ${cleanedTitle}`.slice(0, 80).trim();
}

function techNote(row) {
  const text = String(row.partTitle || "").toLowerCase();
  if (/thermostat|switch|fuse|resistor/.test(text)) {
    return "Match the number and terminal layout before ordering; several small electrical controls can look similar on the bench.";
  }
  if (/panel|door|cover|handle|backsplash/.test(text)) {
    return "Check the photos for mounting tabs, screw points, and cosmetic edges so you know it matches the piece you are replacing.";
  }
  if (/drum|belt|bearing|pulley|wheel|motor/.test(text)) {
    return "Confirm the diagram callout and wear points against your original part before installation.";
  }
  return "Use the part number and diagram callout as the lock; do not rely on appearance alone for fitment.";
}

function buildPhase1A(row, listing, donor, diagramEvidence) {
  const routing = classifyPart(row.partTitle);
  return {
    PART_ID: {
      Diagram_Item_Number: row.diagId || "[X]",
      Assembly_Diagram_Section: diagramEvidence?.assemblySection || "[X]",
      Assembly_Diagram_Image: diagramEvidence?.diagramUrl || "[X]",
      Part_Name: row.partTitle || listing.title || "[X]",
      OEM_Part_Number: row.partNumber,
      Included_Hardware: "[X]",
    },
    COMPATIBILITY_ID: {
      Provenance: `Pulled directly from donor ${donor.brand} ${donor.modelNumber} (Serial: ${donor.serialNumber}). Verify part number, diagram callout, and photos before ordering.`,
    },
    SYSTEM_ROUTING: {
      Confidence_Score: routing.confidence,
      HITL_Review_Required: routing.hitl,
      Flag_Reason: routing.reason,
    },
  };
}

function buildPlainDescription(row, phase1a, donor) {
  return [
    `Title: ${buildTitle(row)}`,
    "",
    "The Part",
    `- Part number: ${row.partNumber}`,
    `- Part label: ${row.partTitle}`,
    `- Diagram callout: ${row.diagId || "[X]"}`,
    `- Donor model record: ${donor.brand} ${donor.modelNumber} / Serial ${donor.serialNumber}`,
    `- Assembly diagram section: ${phase1a.PART_ID.Assembly_Diagram_Section}`,
    "- Included hardware: [X]",
    "",
    "Condition",
    "- Used appliance part removed from a teardown unit.",
    "- Exact testing notes were not supplied in the input evidence.",
    "- Match the part number, diagram callout, and listing photos before ordering.",
    "",
    "Tech's Note:",
    techNote(row),
    "",
    "Terms",
    "- Items ship within 1 business day.",
    "- 30-day returns on uninstalled parts.",
    `- Review routing: ${phase1a.SYSTEM_ROUTING.HITL_Review_Required ? "Needs human review before staging." : "Eligible for local operator review."}`,
  ].join("\n");
}

function buildListingHtml(row, phase1a, donor, diagramEvidence, partPhotos) {
  const status = phase1a.SYSTEM_ROUTING.HITL_Review_Required ? "NEEDS REVIEW" : "LOCAL REVIEW READY";
  const statusColor = phase1a.SYSTEM_ROUTING.HITL_Review_Required ? "#92400e" : "#065f46";
  const statusBg = phase1a.SYSTEM_ROUTING.HITL_Review_Required ? "#fffbeb" : "#ecfdf5";
  const rows = [
    ["Part Number", row.partNumber],
    ["Part Label", row.partTitle],
    ["Diagram Callout", row.diagId || "[X]"],
    ["Donor Machine", `${donor.brand} ${donor.modelNumber}`],
    ["Donor Serial", donor.serialNumber],
    ["Diagram Section", diagramEvidence?.assemblySection || "[X]"],
    ["Condition", "Used"],
    ["Buy It Now", row.ebayBuyNow],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(buildTitle(row))}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#222;line-height:1.55;margin:0;background:#f6f7f9;padding:20px}
    .wrap{max-width:860px;margin:auto;background:#fff;border:1px solid #ddd}
    .brand{background:#162033;color:#fff;padding:18px 22px;font-weight:800;letter-spacing:.04em}
    .brand span{color:#4ea1ff}
    .content{padding:24px}
    h1{font-size:24px;margin:0 0 14px;color:#162033}
    .badge{display:inline-block;background:${statusBg};color:${statusColor};font-weight:800;border:1px solid currentColor;padding:6px 10px;margin-bottom:18px}
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
      <h1>${escapeHtml(buildTitle(row))}</h1>
      <div class="badge">${status} - confidence ${phase1a.SYSTEM_ROUTING.Confidence_Score.toFixed(2)}</div>
      <h2>Part Photos For Sale</h2>
      ${partPhotos.length > 0
        ? `<div class="photos">${partPhotos.map((photo) => `<img src="${escapeHtml(photo.htmlSrc)}" alt="${escapeHtml(row.partNumber)} part photo">`).join("")}</div>`
        : `<div class="pending">PART PHOTO PENDING - do not stage this listing until actual part photos are attached.</div>`}
      <table><tbody>
        ${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "[X]")}</td></tr>`).join("")}
      </tbody></table>
      <h2>The Part</h2>
      <ul>
        <li>Part number lock: ${escapeHtml(row.partNumber)}</li>
        <li>Diagram callout lock: ${escapeHtml(row.diagId || "[X]")}</li>
        <li>Compatibility is limited to the donor record ${escapeHtml(donor.modelNumber)} / ${escapeHtml(donor.serialNumber)} unless separately verified.</li>
      </ul>
      <h2>Condition</h2>
      <p>Used appliance part removed from a teardown unit. Exact testing notes were not supplied in the input evidence. Match the part number, diagram callout, and listing photos before ordering.</p>
      <h2>Tech's Note</h2>
      <div class="note">${escapeHtml(techNote(row))}</div>
      <h2>Internal Validation Evidence</h2>
      <div class="validation">
        Donor/nameplate and diagram evidence validate identity only. They are not sale photos and must not be uploaded as eBay listing images.<br>
        Donor: ${escapeHtml(donor.brand)} ${escapeHtml(donor.modelNumber)} / Serial ${escapeHtml(donor.serialNumber)}.<br>
        Diagram: ${escapeHtml(diagramEvidence?.assemblySection || "[X]")} / Callout ${escapeHtml(row.diagId || "[X]")}.
      </div>
      <h2>Terms</h2>
      <div class="terms">Items ship within 1 business day. 30-day returns on uninstalled parts.</div>
    </div>
  </div>
</body>
</html>`;
}

function buildIndex(records) {
  const reviewCount = records.filter((record) => record.system_routing.hitl_review_required).length;
  const cards = records.map((record) => {
    const status = record.system_routing.hitl_review_required ? "Needs Review" : "Review Ready";
    return `<a class="card ${record.system_routing.hitl_review_required ? "review" : ""}" href="${escapeHtml(record.fileName)}">
      <strong>${escapeHtml(record.partNumber)}</strong>
      <span>${escapeHtml(record.title)}</span>
      <em>${status} - ${record.system_routing.confidence_score.toFixed(2)}</em>
    </a>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RoadrunnerParts Zero-Drift eBay Review</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f6f7f9;color:#172033}
    header{background:#162033;color:white;padding:28px 24px}
    header span{color:#4ea1ff}
    main{max-width:1180px;margin:24px auto;padding:0 18px}
    .stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}
    .stat{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);padding:8px 12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
    .card{display:flex;flex-direction:column;gap:8px;background:white;border:1px solid #d8dee9;padding:14px;text-decoration:none;color:#172033}
    .card:hover{border-color:#2563eb}
    .card.review{border-left:5px solid #f59e0b}
    .card strong{font-size:18px}
    .card span{color:#4b5563}
    .card em{font-style:normal;font-size:12px;font-weight:800;color:#2563eb}
  </style>
</head>
<body>
  <header>
    <h1>Roadrunner<span>Parts</span> Zero-Drift eBay Review</h1>
    <div class="stats">
      <div class="stat">${records.length} listings processed</div>
      <div class="stat">${reviewCount} HITL review</div>
      <div class="stat">Local artifacts only</div>
    </div>
  </header>
  <main><div class="grid">${cards}</div></main>
</body>
</html>`;
}

const sheet = parseSheet(sheetPath);
const listings = loadListings(inputPath);
const listingByPart = new Map(listings.map((listing) => [String(listing.partNumber || "").toUpperCase(), listing]));
const donorEvidence = loadDonorEvidence(donorBomPath);
const approvedPartPhotos = loadApprovedPartPhotos(approvedImageRoot);

fs.mkdirSync(outputDir, { recursive: true });

const outputs = sheet.rows.map((row, index) => {
  const listing = listingByPart.get(row.partNumber.toUpperCase()) || {};
  const diagramEvidence = donorEvidence.diagramByCallout.get(String(row.diagId || "").trim()) || null;
  const partPhotoPaths = findApprovedPartPhotos(row.partNumber, approvedPartPhotos);
  const partPhotos = partPhotoPaths.map((photoPath) => ({
    path: photoPath,
    htmlSrc: toHtmlRelativePath(photoPath, outputDir),
  }));
  const phase1a = buildPhase1A(row, listing, donorEvidence.donor, diagramEvidence);
  const phase1b = {
    title: buildTitle(row),
    description: buildPlainDescription(row, phase1a, donorEvidence.donor),
    layout: ["Title", "The Part", "Condition", "Tech's Note", "Terms"],
  };
  const phase1c = {
    techNote: techNote(row),
    deltaScope: "Added one bounded Tech's Note without changing locked part number, title, diagram callout, or policy terms.",
  };
  const price = parseMoney(row.ebayBuyNow);
  const fileName = `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(row.partNumber)}.html`;
  const payload = {
    api_version: "2026.05-local-review",
    session_id: `SESSION_${donorEvidence.donor.brand}_${donorEvidence.donor.modelNumber}_${donorEvidence.donor.serialNumber}`,
    source_chain: {
      prompt_pack: "ZERO-DRIFT E-COMMERCE: CONSOLIDATED PROMPT PACK v1",
      input_listing_artifact: inputPath,
      input_sheet: sheetPath,
      donor_bom: donorEvidence.source.donorBomPath,
      nameplate_image: donorEvidence.source.nameplateImagePath,
      diagram_root: donorEvidence.source.diagramRoot,
      approved_part_image_root: approvedImageRoot,
      live_ebay_sync: false,
    },
    validationEvidence: {
      nameplateImage: donorEvidence.source.nameplateImageFound ? donorEvidence.source.nameplateImagePath : null,
      assemblyDiagram: diagramEvidence
        ? {
            section: diagramEvidence.assemblySection,
            callout: row.diagId || null,
            imagePath: diagramEvidence.diagramPath,
            imageUrl: diagramEvidence.diagramUrl,
          }
        : null,
    },
    phase0: {
      DONOR_MACHINE_ID: {
        Brand: donorEvidence.donor.brand,
        Model_Number: donorEvidence.donor.modelNumber,
        Serial_Number: donorEvidence.donor.serialNumber,
        Type: donorEvidence.donor.applianceType,
        Session_ID: `${donorEvidence.donor.modelNumber}_${donorEvidence.donor.serialNumber}`,
      },
    },
    phase1a,
    phase1b,
    phase1c,
    system_routing: {
      confidence_score: phase1a.SYSTEM_ROUTING.Confidence_Score,
      hitl_review_required: phase1a.SYSTEM_ROUTING.HITL_Review_Required,
      flag_reason: phase1a.SYSTEM_ROUTING.Flag_Reason,
    },
    ebay_listing_payload: {
      title: phase1b.title,
      categoryId: "20714",
      condition: "Used",
      format: "FixedPrice",
      pricing: {
        buyItNowPrice: price,
        minimumOfferPrice: price ? Number((price * 0.8).toFixed(2)) : null,
      },
      itemSpecifics: {
        Brand: "GE",
        Donor_Brand: donorEvidence.donor.brand,
        Type: row.partTitle,
        MPN: row.partNumber,
        UPC: "Does Not Apply",
        Donor_Model: donorEvidence.donor.modelNumber,
        Donor_Serial: donorEvidence.donor.serialNumber,
        Diagram_Callout: row.diagId || null,
        Diagram_Section: diagramEvidence?.assemblySection || null,
      },
      shipping: {
        packageType: null,
        shippingService: null,
      },
      attachedImages: partPhotos.map((photo) => photo.path),
      imageStatus: partPhotos.length > 0 ? "part_photos_attached" : "part_photo_pending",
      description: buildListingHtml(row, phase1a, donorEvidence.donor, diagramEvidence, partPhotos),
    },
    fileName,
  };

  fs.writeFileSync(path.join(outputDir, fileName), payload.ebay_listing_payload.description);
  return payload;
});

const normalized = {
  generatedAt: new Date().toISOString(),
  inputPath,
  sheetPath,
  promptPack: "ZERO-DRIFT E-COMMERCE: CONSOLIDATED PROMPT PACK v1",
  liveEbaySync: false,
  listings: outputs,
};

fs.writeFileSync(path.join(outputDir, "chain-payloads.json"), JSON.stringify(normalized, null, 2));
fs.writeFileSync(path.join(outputDir, "index.html"), buildIndex(outputs.map((output) => ({
  fileName: output.fileName,
  partNumber: output.ebay_listing_payload.itemSpecifics.MPN,
  title: output.ebay_listing_payload.title,
  system_routing: output.system_routing,
}))));

const hitlCount = outputs.filter((output) => output.system_routing.hitl_review_required).length;
console.log(`Processed ${outputs.length} eBay listings through the zero-drift chain.`);
console.log(`HITL review required: ${hitlCount}`);
console.log(`Output: ${path.join(outputDir, "index.html")}`);
console.log(`Payloads: ${path.join(outputDir, "chain-payloads.json")}`);
