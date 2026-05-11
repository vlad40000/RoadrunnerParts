/**
 * RoadRunnerParts eBay Listing Generator v2
 * Generates eBay-compliant seller description HTML
 * styled to match eBay's native product page aesthetic.
 */
const fs = require('fs');
const path = require('path');

const data = require('./ebay-html-premium/listings.normalized.json');
const OUT_DIR = path.join(__dirname, 'ebay-html-v2');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseDescription(desc) {
  if (!desc) return { features: [], compatibility: '', symptoms: '', quality: '' };
  const clean = desc.replace(/<\/?b>/g, '');
  const features = [];
  const featureMatch = clean.match(/Product Features:\s*([\s\S]*?)(?=Compatibility:|Professional Quality|Common Symptoms|Quality Assurance|$)/i);
  if (featureMatch) {
    featureMatch[1].split(/\n/).forEach(l => {
      const t = l.replace(/^-\s*/, '').trim();
      if (t && t.length > 5) features.push(t);
    });
  }
  const compatMatch = clean.match(/Compatibility:\s*([\s\S]*?)(?=Professional Quality|Common Symptoms|Quality Assurance|$)/i);
  const sympMatch = clean.match(/Common Symptoms Fixed:\s*([\s\S]*?)(?=Quality Assurance|$)/i);
  return {
    features,
    compatibility: compatMatch ? compatMatch[1].trim() : '',
    symptoms: sympMatch ? sympMatch[1].trim() : '',
  };
}

function buildSpecRows(specs) {
  const rows = [];
  if (specs.brand) rows.push(['Brand', specs.brand]);
  if (specs.mpn) rows.push(['MPN', specs.mpn]);
  if (specs.type) rows.push(['Type', specs.type]);
  if (specs.condition) rows.push(['Condition', specs.condition]);
  if (specs.diagramId) rows.push(['Diagram Position', `#${specs.diagramId}`]);
  return rows;
}

function getImages(listing) {
  const imgs = [];
  if (listing.imageCandidates && listing.imageCandidates.length) {
    listing.imageCandidates.forEach(c => { if (c.imageUrl) imgs.push(c.imageUrl); });
  } else if (listing.imageCandidate && listing.imageCandidate.imageUrl) {
    imgs.push(listing.imageCandidate.imageUrl);
  }
  return imgs;
}

function generateHTML(listing, idx) {
  const { specs = {} } = listing;
  const parsed = parseDescription(listing.description);
  const images = getImages(listing);
  const mainImg = images[0] || '';
  const thumbs = images.slice(0, 4);
  const specRows = buildSpecRows(specs);
  const models = (specs.compatibleModels || []).slice(0, 8);
  const price = listing.ebayBuyNow || '$0.00';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(listing.originalTitle || listing.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;color:#191919;background:#fff;line-height:1.5;font-size:14px}

/* === HEADER === */
.rr-header{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:0}
.rr-header-inner{max-width:1200px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.rr-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.rr-logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:8px;display:flex;align-items:center;justify-content:center}
.rr-logo-icon svg{width:20px;height:20px;fill:white}
.rr-logo-text{font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px}
.rr-logo-text span{color:#60a5fa}
.rr-header-badges{display:flex;gap:20px}
.rr-badge{display:flex;align-items:center;gap:8px;color:#94a3b8;font-size:12px;font-weight:500}
.rr-badge svg{width:16px;height:16px;fill:#60a5fa}

/* === TRUST BAR === */
.rr-trust-bar{background:#f0f7ff;border-bottom:1px solid #dbeafe;padding:10px 0}
.rr-trust-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;justify-content:center;gap:32px;flex-wrap:wrap}
.rr-trust-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#1e40af;font-weight:600}
.rr-trust-item svg{width:14px;height:14px;fill:#2563eb}

/* === PRODUCT GRID === */
.rr-product{max-width:1200px;margin:0 auto;padding:32px 24px}
.rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
@media(max-width:768px){.rr-grid{grid-template-columns:1fr;gap:24px}}

/* === GALLERY === */
.rr-gallery{display:flex;gap:12px}
.rr-thumbs{display:flex;flex-direction:column;gap:8px}
.rr-thumb{width:64px;height:64px;border:2px solid #e5e7eb;border-radius:8px;overflow:hidden;cursor:pointer;padding:4px;background:#fff;transition:border-color .2s}
.rr-thumb:hover,.rr-thumb.active{border-color:#3b82f6}
.rr-thumb img{width:100%;height:100%;object-fit:contain}
.rr-main-img{flex:1;aspect-ratio:1;background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden}
.rr-main-img img{max-width:100%;max-height:100%;object-fit:contain;transition:transform .3s}
.rr-main-img:hover img{transform:scale(1.03)}
.rr-no-img{color:#9ca3af;font-size:13px;text-align:center}
.rr-no-img svg{width:48px;height:48px;fill:#d1d5db;margin-bottom:8px}

/* === DETAILS === */
.rr-details{display:flex;flex-direction:column;gap:16px}
.rr-part-tag{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;padding:4px 10px;border-radius:4px;width:fit-content}
.rr-title{font-size:22px;font-weight:700;line-height:1.3;color:#111827}
.rr-price-row{display:flex;align-items:baseline;gap:12px;padding:16px 0;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6}
.rr-price{font-size:28px;font-weight:700;color:#111827}
.rr-retail{font-size:14px;color:#6b7280;text-decoration:line-through}
.rr-savings{font-size:13px;font-weight:600;color:#059669;background:#ecfdf5;padding:2px 8px;border-radius:4px}
.rr-condition{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#374151;font-weight:500}
.rr-condition-dot{width:8px;height:8px;background:#22c55e;border-radius:50%}

/* === SPECS TABLE === */
.rr-specs{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.rr-specs-header{background:#f9fafb;padding:12px 16px;font-weight:700;font-size:14px;border-bottom:1px solid #e5e7eb}
.rr-specs table{width:100%;border-collapse:collapse}
.rr-specs td{padding:10px 16px;font-size:13px;border-bottom:1px solid #f3f4f6}
.rr-specs tr:last-child td{border-bottom:none}
.rr-specs td:first-child{color:#6b7280;font-weight:500;width:140px}
.rr-specs td:last-child{font-weight:600;color:#111827}

/* === COMPATIBILITY === */
.rr-compat{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px}
.rr-compat-title{font-weight:700;font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.rr-compat-title svg{width:16px;height:16px;fill:#2563eb}
.rr-models{display:flex;flex-wrap:wrap;gap:6px}
.rr-model{background:#fff;border:1px solid #d1d5db;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;color:#374151;font-family:'Courier New',monospace}

/* === DESCRIPTION === */
.rr-desc-section{max-width:1200px;margin:0 auto;padding:0 24px 32px}
.rr-desc-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.rr-desc-tabs{display:flex;border-bottom:1px solid #e5e7eb;background:#fafafa}
.rr-tab{padding:14px 24px;font-size:13px;font-weight:600;color:#6b7280;border-bottom:2px solid transparent;cursor:pointer;transition:all .2s}
.rr-tab.active{color:#2563eb;border-bottom-color:#2563eb;background:#fff}
.rr-desc-body{padding:24px}
.rr-desc-body h3{font-size:16px;font-weight:700;margin-bottom:12px;color:#111827}
.rr-desc-body p{color:#4b5563;margin-bottom:12px;font-size:14px}
.rr-features{list-style:none;padding:0}
.rr-features li{padding:8px 0;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#374151}
.rr-features li:last-child{border-bottom:none}
.rr-check{color:#22c55e;font-weight:700;flex-shrink:0}

/* === FOOTER === */
.rr-footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px;text-align:center}
.rr-footer-inner{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:8px;align-items:center}
.rr-footer-brand{font-size:16px;font-weight:700;color:#1e293b}
.rr-footer-brand span{color:#3b82f6}
.rr-footer-text{font-size:12px;color:#9ca3af}
</style>
</head>
<body>

<!-- HEADER -->
<div class="rr-header">
<div class="rr-header-inner">
  <a class="rr-logo" href="#">
    <div class="rr-logo-icon"><svg viewBox="0 0 24 24"><path d="M13 2.05v2.02c3.95.49 7 3.85 7 7.93 0 1.45-.39 2.81-1.06 3.98l1.73 1C21.52 15.29 22 13.2 22 11c0-5.18-3.95-9.45-9-9.95zM12 19c-3.87 0-7-3.13-7-7 0-3.53 2.61-6.43 6-6.92V3.03C5.06 3.52 1 7.27 1 12c0 6.08 4.92 11 11 11 3.17 0 6.02-1.34 8.03-3.48l-1.73-1C16.76 20.07 14.5 21 12 21v-2z"/></svg></div>
    <div class="rr-logo-text">Roadrunner<span>Parts</span></div>
  </a>
  <div class="rr-header-badges">
    <div class="rr-badge"><svg viewBox="0 0 24 24"><path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3z"/></svg>Verified Seller</div>
    <div class="rr-badge"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Fast Shipping</div>
  </div>
</div>
</div>

<!-- TRUST BAR -->
<div class="rr-trust-bar">
<div class="rr-trust-inner">
  <div class="rr-trust-item"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>Genuine OEM Parts</div>
  <div class="rr-trust-item"><svg viewBox="0 0 24 24"><path d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3z"/></svg>Quality Inspected</div>
  <div class="rr-trust-item"><svg viewBox="0 0 24 24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2h2V8h4v2h2V8h2v12z"/></svg>30-Day Returns</div>
  <div class="rr-trust-item"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>Satisfaction Guaranteed</div>
</div>
</div>

<!-- PRODUCT SECTION -->
<div class="rr-product">
<div class="rr-grid">
  <!-- Gallery -->
  <div class="rr-gallery">
    ${thumbs.length > 1 ? `<div class="rr-thumbs">${thumbs.map((t,i) => `<div class="rr-thumb${i===0?' active':''}" onclick="document.querySelector('.rr-main-img img').src='${t}';document.querySelectorAll('.rr-thumb').forEach(x=>x.classList.remove('active'));this.classList.add('active')"><img src="${t}" alt="View ${i+1}"></div>`).join('')}</div>` : ''}
    <div class="rr-main-img">
      ${mainImg ? `<img src="${mainImg}" alt="${escapeHtml(listing.title)}">` : `<div class="rr-no-img"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg><div>Image pending review</div></div>`}
    </div>
  </div>

  <!-- Details -->
  <div class="rr-details">
    <div class="rr-part-tag">GE Genuine OEM Part</div>
    <h1 class="rr-title">${escapeHtml(listing.originalTitle || listing.title)}</h1>
    
    <div class="rr-condition"><div class="rr-condition-dot"></div>${escapeHtml(specs.condition || 'Used')} — Professionally Inspected</div>

    <div class="rr-price-row">
      <div class="rr-price">US ${escapeHtml(price)}</div>
      ${listing.retail ? `<div class="rr-retail">${escapeHtml(listing.retail)}</div>` : ''}
      ${listing.retail && listing.ebayBuyNow ? (() => {
        const r = parseFloat(listing.retail.replace('$',''));
        const e = parseFloat(listing.ebayBuyNow.replace('$',''));
        const pct = r > 0 ? Math.round((1 - e/r)*100) : 0;
        return pct > 0 ? `<div class="rr-savings">${pct}% off</div>` : '';
      })() : ''}
    </div>

    <!-- Specs -->
    <div class="rr-specs">
      <div class="rr-specs-header">Item Specifics</div>
      <table>${specRows.map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
    </div>

    <!-- Compatible Models -->
    ${models.length ? `<div class="rr-compat">
      <div class="rr-compat-title"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Compatible Models</div>
      <div class="rr-models">${models.map(m => `<span class="rr-model">${escapeHtml(m)}</span>`).join('')}</div>
    </div>` : ''}
  </div>
</div>
</div>

<!-- DESCRIPTION SECTION -->
<div class="rr-desc-section">
<div class="rr-desc-card">
  <div class="rr-desc-tabs">
    <div class="rr-tab active">About This Part</div>
    <div class="rr-tab">Shipping</div>
    <div class="rr-tab">Returns</div>
  </div>
  <div class="rr-desc-body">
    ${parsed.features.length ? `<h3>Product Features</h3><ul class="rr-features">${parsed.features.map(f => `<li><span class="rr-check">✓</span>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
    
    ${parsed.symptoms ? `<h3 style="margin-top:20px">Common Symptoms This Fixes</h3><p>${escapeHtml(parsed.symptoms)}</p>` : ''}
    
    <h3 style="margin-top:20px">Quality Assurance</h3>
    <p>Every part from RoadrunnerParts is professionally inspected, tested for structural integrity and mechanical performance, and prepared for immediate installation.</p>
  </div>
</div>
</div>

<!-- FOOTER -->
<div class="rr-footer">
<div class="rr-footer-inner">
  <div class="rr-footer-brand">Roadrunner<span>Parts</span></div>
  <div class="rr-footer-text">Genuine OEM Appliance Parts · Professionally Inspected · Fast Shipping</div>
  <div class="rr-footer-text">© 2026 RoadrunnerParts. All rights reserved.</div>
</div>
</div>

</body>
</html>`;
}

// Generate index
function generateIndex(listings) {
  const rows = listings.map((l, i) => {
    const num = String(i+1).padStart(3,'0');
    const file = `${num}-${l.partNumber}.html`;
    const hasImg = !!(l.imageCandidate && l.imageCandidate.imageUrl);
    return `<tr>
      <td>${i+1}</td>
      <td><a href="${file}">${l.partNumber}</a></td>
      <td>${escapeHtml(l.title)}</td>
      <td>${l.ebayBuyNow || '—'}</td>
      <td>${l.retail || '—'}</td>
      <td>${hasImg ? '✅' : '⚠️'}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>RoadrunnerParts — eBay Listings Dashboard</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0f172a;color:#e2e8f0;padding:32px}
h1{font-size:28px;font-weight:700;margin-bottom:4px}
h1 span{color:#60a5fa}
.sub{color:#94a3b8;font-size:14px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden}
th{background:#334155;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8}
td{padding:12px 16px;border-bottom:1px solid #334155;font-size:14px}
tr:last-child td{border-bottom:none}
tr:hover td{background:#334155}
a{color:#60a5fa;text-decoration:none;font-weight:600}
a:hover{text-decoration:underline}
</style></head><body>
<h1>Roadrunner<span>Parts</span></h1>
<div class="sub">${listings.length} eBay Listings — HTDX100ED3WW Dryer Parts</div>
<table><thead><tr><th>#</th><th>Part #</th><th>Title</th><th>eBay Price</th><th>Retail</th><th>Image</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
}

// Run
const listings = data.listings;
listings.forEach((l, i) => {
  const num = String(i+1).padStart(3,'0');
  const filename = `${num}-${l.partNumber}.html`;
  fs.writeFileSync(path.join(OUT_DIR, filename), generateHTML(l, i));
});
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), generateIndex(listings));
console.log(`Generated ${listings.length} listings + index in ${OUT_DIR}`);
