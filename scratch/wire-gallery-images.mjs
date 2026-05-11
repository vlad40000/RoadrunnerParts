/**
 * wire-gallery-images.mjs
 * Wires the image map into ebay_mockup_gallery.html:
 *   1. Adds image gallery CSS
 *   2. Rewrites showListing() to render product images
 *   3. Adds image status indicators to sidebar items
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const galleryPath = join(__dirname, '..', 'ebay_mockup_gallery.html');
const imageMapPath = join(__dirname, 'listing-image-map.json');

const imageMap = JSON.parse(readFileSync(imageMapPath, 'utf-8')).map;
let html = readFileSync(galleryPath, 'utf-8');

// ─── 1. Inject image gallery CSS before </style> ─────────────────────────
const imageCSS = `
        /* Product Image Gallery */
        .preview-gallery {
            margin-bottom: 24px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
            background: #fafafa;
        }
        .preview-main-image {
            width: 100%;
            aspect-ratio: 1 / 1;
            max-height: 500px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff;
            cursor: crosshair;
            overflow: hidden;
        }
        .preview-main-image img {
            max-width: 100%;
            max-height: 500px;
            object-fit: contain;
            transition: transform 0.3s ease;
        }
        .preview-main-image img:hover {
            transform: scale(1.08);
        }
        .preview-thumbs {
            display: flex;
            gap: 8px;
            padding: 10px;
            background: #f3f4f6;
            border-top: 1px solid #e5e7eb;
            overflow-x: auto;
        }
        .preview-thumb {
            width: 64px;
            height: 64px;
            border-radius: 4px;
            border: 2px solid transparent;
            cursor: pointer;
            object-fit: cover;
            background: #fff;
            transition: border-color 0.2s, opacity 0.2s;
            flex-shrink: 0;
        }
        .preview-thumb:hover {
            border-color: var(--primary);
            opacity: 0.85;
        }
        .preview-thumb.active-thumb {
            border-color: var(--primary);
            box-shadow: 0 0 0 1px var(--primary);
        }
        .no-image-placeholder {
            width: 100%;
            aspect-ratio: 1 / 1;
            max-height: 400px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f9fafb;
            color: #9ca3af;
            font-size: 14px;
            gap: 8px;
        }
        .no-image-placeholder svg {
            width: 48px;
            height: 48px;
            opacity: 0.4;
        }
        .image-status-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
            vertical-align: middle;
        }
        .image-status-dot.has-image { background: #10b981; }
        .image-status-dot.no-image { background: #d1d5db; }
        .image-review-badge {
            display: inline-block;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: #fef3c7;
            color: #92400e;
            margin-top: 4px;
        }`;

html = html.replace('    </style>', imageCSS + '\n    </style>');

// ─── 2. Add image status dots to sidebar items ───────────────────────────
// Parse part numbers from sidebar items and add green/gray dots
html = html.replace(
    /(<div class="listing-item-pn">)([A-Z0-9]+)(<\/div>)/g,
    (match, open, pn, close) => {
        const hasImage = imageMap[pn] ? 'has-image' : 'no-image';
        return `${open}<span class="image-status-dot ${hasImage}"></span>${pn}${close}`;
    }
);

// ─── 3. Build the imageIndex JS object ───────────────────────────────────
const imageIndexJS = `
        // Image lookup map (auto-generated from listing-image-map.json)
        const imageIndex = ${JSON.stringify(
            Object.fromEntries(
                Object.entries(imageMap).map(([pn, data]) => [
                    pn,
                    { main: data.mainImage, thumbs: data.thumbnails }
                ])
            )
        )};`;

// ─── 4. Rewrite the showListing function ─────────────────────────────────
const newShowListing = `
        function showListing(index) {
            const listing = listings[index];
            welcomeDiv.classList.add('hidden');
            previewDiv.classList.remove('hidden');
            
            items.forEach(item => item.classList.remove('active'));
            document.querySelector(\`[data-index="\${index}"]\`).classList.add('active');

            const desc = listing.description.replace(/\\n/g, '<br>');
            const conditionLabel = "Used - inspected and prepared for resale";
            
            // Image gallery rendering
            const imgData = imageIndex[listing.partNumber];
            let imageGalleryHTML = '';
            if (imgData && imgData.main) {
                const allImages = [imgData.main, ...(imgData.thumbs || [])];
                const thumbsHTML = allImages.map((url, i) => 
                    \`<img class="preview-thumb \${i === 0 ? 'active-thumb' : ''}" src="\${url}" onclick="swapMainImage(this, '\${url.replace(/'/g, "\\\\'")}');" onerror="this.style.display='none'" alt="View \${i+1}">\`
                ).join('');
                
                imageGalleryHTML = \`
                    <div class="preview-gallery">
                        <div class="preview-main-image">
                            <img id="main-product-image" src="\${imgData.main}" alt="\${listing.title}" onerror="this.parentElement.innerHTML='<div class=\\\\"no-image-placeholder\\\\">Image failed to load</div>'">
                        </div>
                        <div class="preview-thumbs">\${thumbsHTML}</div>
                    </div>
                    <div class="image-review-badge">\\u26A0 Image requires watermark review before production use</div>
                \`;
            } else {
                imageGalleryHTML = \`
                    <div class="preview-gallery">
                        <div class="no-image-placeholder">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                            <span>IMAGE PENDING</span>
                            <span style="font-size:11px">No verified image available for \${listing.partNumber}</span>
                        </div>
                    </div>
                \`;
            }
            
            previewDiv.innerHTML = \`
                <div class="ebay-container">
                    <div class="ebay-header">
                        <div class="namemark">Roadrunner<span class="namemark-accent">Parts</span></div>
                    </div>
                    
                    <div class="ebay-content">
                        <div class="condition-badge">Condition: Used</div>
                        <h1 class="ebay-title">\${listing.title}</h1>
                        
                        \${imageGalleryHTML}

                        <table class="ebay-specs-table">
                            <tbody>
                                <tr><th>Part Number</th><td><strong>\${listing.partNumber}</strong></td></tr>
                                <tr><th>Brand</th><td>\${listing.specs.brand || 'GE'}</td></tr>
                                <tr><th>Condition</th><td>\${conditionLabel}</td></tr>
                            </tbody>
                        </table>

                        <div class="ebay-section-title">Item Description</div>
                        <div class="ebay-description-text">
                            <p><i>Note: This is a high-quality used component removed from a fully inspected appliance.</i></p>
                            \${desc}
                        </div>

                        <div class="ebay-section-title">Shipping & Handling</div>
                        <div class="ebay-policy-box">
                            <p style="margin: 0;">We professionally pack and ship all items within 1 business day. Expedited shipping options are available at checkout.</p>
                        </div>

                        <div class="ebay-section-title">Returns</div>
                        <div class="ebay-policy-box">
                            <p style="margin: 0;">Returns are handled under the return terms shown on this eBay listing. Returned parts must be sent back in the same condition received.</p>
                        </div>
                    </div>

                    <div class="ebay-footer">
                        Thank you for shopping with Roadrunner Parts. Your trusted source for professional appliance components.
                    </div>
                </div>
            \`;
            document.getElementById('preview-pane').scrollTop = 0;
        }

        function swapMainImage(thumbEl, url) {
            document.getElementById('main-product-image').src = url;
            document.querySelectorAll('.preview-thumb').forEach(t => t.classList.remove('active-thumb'));
            thumbEl.classList.add('active-thumb');
        }`;

// Replace the old showListing + add imageIndex before it
const oldShowListingPattern = /function showListing\(index\) \{[\s\S]*?document\.getElementById\('preview-pane'\)\.scrollTop = 0;\s*\}/;
html = html.replace(oldShowListingPattern, imageIndexJS + '\n' + newShowListing);

// ─── 5. Add stats comment at top ─────────────────────────────────────────
const totalParts = 88;
const withImages = Object.keys(imageMap).length;
const statsComment = `<!-- Gallery with images wired: ${withImages}/${totalParts} parts have product images (generated ${new Date().toISOString()}) -->\n`;
html = html.replace('<!DOCTYPE html>', statsComment + '<!DOCTYPE html>');

writeFileSync(galleryPath, html, 'utf-8');

console.log(`Gallery updated successfully:`);
console.log(`  - ${withImages}/${totalParts} listings now have product images`);
console.log(`  - Image gallery CSS injected`);
console.log(`  - showListing() rewritten with image rendering`);
console.log(`  - Sidebar items now show green/gray image status dots`);
console.log(`  - Thumbnail click-to-swap functionality added`);
