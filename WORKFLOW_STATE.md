# Workflow State - eBay Listing Pipeline

## Status: Local HTML Review (Images Integrated - Watermark Guarded)

### Completed Components
1. **HTML Template Generator**: `src/lib/ebay-template-gen.ts`
   - Responsive design with "RoadrunnerParts" branding.
   - Inline CSS for eBay policy compliance.
   - Structured sections for description, specs, condition, and returns.

2. **Listing Pipeline Integration**: `src/lib/ebay-listing-gen.ts`
   - Description generation now outputs rich HTML.

3. **Prompt Engineering**: `src/features/bom/prompts/may7-rld-prompts.ts`
   - Added `MAY7_ROADRUNNER_EBAY_LISTING_PROMPT`.
   - Enforces strict data-extraction rules (no hallucinated specs).

4. **Testing**: `src/lib/__tests__/ebay-template-gen.test.ts`
   - Unit tests pass for all core template logic.

### Pending
- **Tomorrow's Priority**: Go over the Obsidian durable memory architecture integration.
- **eBay Deployment**: Disabled. Do not push or sync listings directly to eBay yet.
- **Operator Review**: Review local HTML files before any future listing-draft or marketplace sync work. (Note: a specialized audit dashboard for the 50 corrected finalized items has been generated at `scratch/ebay-html-final-52/index.html`).
- **Audit Findings (2026-05-08)**: 50/50 selected listing records processed after duplicate/error cleanup. Image display is now strict: candidates must carry exact part-number evidence from an approved source, otherwise the listing shows `IMAGE PENDING` for operator review.
- **Inventory Linking**: Pending; local HTML artifacts are currently for visual review only.

## Selected Final Listings (50 Units)
- **Status**: AUDIT READY (24 Mismatches Flagged)
- **Source**: `scratch/ebay-html-final-52/listings.normalized.json` is now the authoritative source of truth for the audit.
- **Dashboard**: `scratch/ebay-html-final-52/index.html` contains the finalized premium audit dashboard with red-flagged mismatch visual states.

## Listing Optimization (88 Units)
- **Status**: COMPLETE
- **Condition**: Normalized to "Used" (Inspected & Prepared for Resale)
- **Content**: Professional format with symptoms, compatibility, and features.
- **Title**: Optimized for SEO and max 80 characters.

## Image Strategy
- **Status**: REFRESHED (No Watermarks Policy)
- **Source**: Real product imagery discovered via `find-ebay-images.mjs` with GE/OEM sources preferred over mixed-trust ReliableParts candidates.
- **Note**: AI image generation is STRICTLY PROHIBITED.
- **Policy**: NO WATERMARKED IMAGES. Known watermarked domains and watermark text are hard-excluded. ReliableParts is not blanket-approved because some images are watermarked; remaining ReliableParts candidates are marked `candidate_needs_watermark_review` and do not outrank clean GE candidates.
- **Gallery**: Updated to support multi-image selection so the operator can choose the cleanest available shot.
- **Review**: Operator must review `scratch/ebay-html-with-images/index.html` for final approval.
- **Image Selection**: If the primary image has a watermark, use the **Thumbnail Gallery** to select a clean alternative. Click the thumbnail to swap the main image, then save/note the selection.
- **Goal**: Ensure 100% watermark-free listings before any draft staging.

### Review Findings - 2026-05-07
- `C:\Users\bradv\Downloads\Ebay listings revised 1.txt` contains 88 unique part entries and is the current source for HTML export.
- All listings have been updated to "Used" condition to match the inventory.

### Local HTML Export - 2026-05-07
- `scripts/export-ebay-html.mjs` converts listing artifacts into local HTML previews.
- **Images**: Real web candidates are now integrated for all 88 listings.
- Output: `scratch/ebay-html/` contains all 88 part files and a central `index.html`.

### Image Candidate Discovery & Multi-Image Gallery - 2026-05-08
- `scripts/find-ebay-images.mjs` has been updated to support robust multi-image extraction:
    - **Reliable Parts**: Improved JSON-gallery parsing for full visual coverage.
    - **GE Appliances**: Direct spec page targeting implemented (partially limited by Cloudflare).
    - **Multi-Image Manifest**: `scratch/ebay-images/image-candidates.json` now stores arrays of candidates per part.
    - **Watermark Protection**: Hard-excludes known watermarked domains and watermark text. ReliableParts candidates are retained only as review candidates, not auto-approved.
    - **Generic Asset Protection**: Hard-excludes favicon/icon/logo/button/lockup assets and tiny GE/Salsify transformed thumbnails such as `w_185,h_193`.
- Current Pipeline Status: 88/88 parts have image candidates; 88/88 generated primary images are from GE domains (`geapplianceparts.com` or `geappliances.com`).
- Generic Asset Status: 0 favicon/icon/button/lockup/tiny-thumbnail URLs remain in `scratch/ebay-images/image-candidates.json` or `scratch/ebay-html-with-images/listings.with-images.json`.

### Premium Audit Dashboard (Roadrunner v2)
- **Status**: READY FOR REVIEW (88/88 Parts)
- **UI Architecture**:
    - **Dashboard**: High-conversion card layout with animated entry and status badges.
    - **Audit View**: Dual-column layout (Gallery / Specs) with glassmorphism styling.
    - **Interactive Gallery**: Instant swap thumbnail grid with candidate scoring metadata.
- **Watermark Policy**: STRICT (Penalized: PartsDr, APP, PartsWarehouse, Sears).
- **Next Action**: Operator review of `scratch/ebay-html-premium/index.html`.
- **Status Summary**: 88/88 parts have candidate arrays. 
- **Watermark Guard**: Known watermarked domains are penalized. ReliableParts and Sears candidates are flagged for manual verification.
- **Generic Asset Guard**: Favicon/icon/button/lockup assets and tiny `w_185,h_193` Salsify thumbnails are excluded from both `scratch/ebay-html-with-images/` and `scratch/ebay-html-premium/`.
- **Compliance**: Image candidates require operator approval and image-use rights before live deployment.

### BOM Extraction (D&L Parts Co)
- **Status**: COMPLETE (2026-05-09)
- **Source**: `https://www.dlpartscolookup.com/lookup/`
- **Output**: `BOM_HTDX100ED3WW_ALL.json` (90 parts extracted)
- **Notes**: Verified that the base lookup URL only provides parts for the first diagram. A multi-diagram Python script (`extract_dlparts_bom_all.py`) was developed to scrape the full 90-part BOM by iterating through all available diagram endpoints.

### BOM Extraction (Encompass)
- **Status**: COMPLETE (2026-05-09)
- **Source**: `https://encompass.com/search` & `https://encompass.com/model/`
- **Output**: `Encompass_BOM_HTDX100ED3WW.json` (88 parts extracted)
- **Notes**: Encompass utilizes a Next.js App Router (React Server Components) architecture. Parts lists are not rendered in the raw HTML DOM. A Python script (`fetch_encompass.py`) was rewritten to bypass brittle HTML parsing by resolving the canonical `modelID` via search, and then directly parsing the RSC JSON payload embedded in the `<script>` tags (`self.__next_f.push`) to successfully extract all 88 parts natively.

### Backlog Parts List
WE21X20562	Drum Asm 6.0 (replacement)	503
WE21X20407	Drum Asm 6.0 Cu.ft Wh	503
WE19M1713	Backsplash Graphics Asm	13
WE11M10001	Dryer Heating Element	514
WE11X20397	GE Dryer Heating Element	512
WE17X22217	Kit Motor & Pulley (current; original GE WE17M66)	630
WE4M160	Dryer Safety Thermostat	505
WE4M532	Dryer Timer	100
WE49X22295	Kit Front Panel and Inner Door	305
WE10X20418	Inner Door Asm White	305
WE20X20409	Dryer Front Panel (replaced by WE49X22295)	301
WE20X20412	Bottom Cover	222
WE03X20434	Dryer Idler Pulley Arm	215
WE20X20417	Dryer Top Panel	401
WE20X20396	Rear Panel	420
WE4M137	Dryer High-limit Thermostat	507
WE20X20391	Chassis Base	408
WE49X22294	Kit Of Servi	4
WE14X20392	Dryer Blower Housing	219
WE19M1481	Dryer Control Panel Cover, Rear	72
WE10X20468	Dryer Door Outer Panel (white)	307
WE4M181	Dryer Cycling Thermostat	506
WE19M1478	End Cap Lh W (replaced by WE49X22294)	3
WE16X20393	Laundry Center Dryer Blower Wheel	201
WE18X25100	Dryer Lint Screen	300
WE18M28	Filter & Mesh Asm.	300
WE14X20425	Trap Duct (replaced by WE14X25080)	311
WE13M39	Motor Support	205
WE20X20406	Dryer Side Panel (white)	404
WE1M1002	Fuse Cemr 30 Amp 120V	418
WE1X921	Motor Strap	204
WE1M300	Dryer Drum Bearing Bracket	3102
WE03X29897	Dryer Drum Belt	213
WE4M404	Dryer Temperature Switch	87
WE12X21574	Belt Drive	213
WE1M1003	Dryer Fuse Holder	417
WE4M255	Kenmore Dryer Timer Resistor	80
WE13X30697	Dryer Motor Clamp	203
WE11X29438	Dryer Drum Rear Cover	504
WE1M1007	Cover Fuse Terminal	430
WE3M56	Bearing	313
WE03X20228	Top Bearing (replaced by WE3M56)	313
WE4M415	Dryer Door Switch	380
WE1M462	Kenmore Dryer Rear Bearing	3106
WE11X20400	Heater Housing (replaced by WE11M10002)	513
WE01X20419	Dryer Door Handle (white)	603
WE4M416	Dryer Push-to-start Switch	35
WE4M127	Dryer Operating Thermostat	230
WE4M525	4 Term Blk & Grnd Strap	419
WD21X10261	Interlock Switch	803
WD21X557	Interlock Sw	803
WE1M1030	Shield Bottom Cover	271
WH2M270	We2x328	3204
WE1M650	Dryer Motor Wire Harness Connector	631
WE13X20394	Motor Plate	233
WE1M652	Dryer Control Knob	7
WE09X20441	Felt Trap Duct	312
WE1M1015	Ground Strap Asm	515
WE03X37319	Dryer Drum Glide Bearing	317
WE3M51	Bearing Slide	317
WE2M96	Cap Nut	234
WE1M659	Push/ Start Button Grey	2232
WE1M1101	Levelling Leg	236
WE14X20426	Baffle	509
WE1M461	Kenmore Dryer Rear Bearing O-ring	3127
WE1M780	Dryer Heating Element Bracket	510
WE1M825	a , Gasket (Seal) 39 Inch	325
WE01X20423	Dryer Power Cord Access Bracket	431
WE03X37320	Dryer Drum Glide Bearing, Upper	316
WE1M934	Door Reversal Plug	112
WE3M52	Bearing Slide	316
WE03X31620	Dryer Idler Pulley	216
WE09X27636	Dryer Blower Gasket	218
WE12X20395	Idler Pulley	216
WE1M966	Blower Gasket (Exhaust)	218
WH01X10313	Washer Control Knob	19
WE1M1011	Latch	327
WE1M536	Latch	327
WE1M1033	Dryer Door Hinge	3051
WE1M505	Hinge	3051
WE2M196	Ground Screw	319
WE1X1192	Door Strike	3049
WZ05X0158	Screw 8-32X3/8 Grd Scr	461
WE00X181L	Shaft	508
WE00X1811	Shaft	508
