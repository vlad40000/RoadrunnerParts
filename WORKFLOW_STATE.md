# Workflow State - eBay Listing Pipeline

## Status: Local HTML Review (Images Integrated - 3/88)

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
- **eBay Deployment**: Disabled. Do not push or sync listings directly to eBay yet.
- **Operator Review**: Review local HTML files before any future listing-draft or marketplace sync work.
- **Inventory Linking**: Pending; local HTML artifacts are not live inventory records.

### Next Steps
1. **Local Review**: Open `scratch/ebay-html/index.html` and inspect the 88 generated listing previews.
2. **Copy / Policy Pass**: Mark any title, compatibility, OEM, return-policy, or condition wording that needs manual correction.
3. **Draft Integration Later**: Only after review, wire approved HTML into draft storage. Do not deploy to eBay.

### Review Findings - 2026-05-07
- `C:\Users\bradv\Downloads\Ebay  descriptions1.txt` was reviewed earlier and is not valid JSON because of unescaped quote/log-text issues.
- `C:\Users\bradv\Downloads\Ebay listings revised 1.txt` contains 88 unique part entries and was repaired at parse time because it is missing the final closing object brace.
- `scratch/ge_dryer_listings.json` contains 70 live Gemini-generated rows; the revised text file is the fuller 88-row source for this HTML export pass.
- Data accuracy has not been fully proven against `model_parts_raw` in this pass; local HTML files are review artifacts, not source-of-truth evidence.

### Local HTML Export - 2026-05-07
- `scripts/export-ebay-html.mjs` converts listing JSON/text artifacts into static local HTML previews.
- **Images**: Added an image section to the template. High-quality product images have been generated for 3 priority parts (WE21X20562, WE11M10001, WE17X22217).
- Output written to `scratch/ebay-html/`: 88 part HTML files, `index.html`, and `listings.normalized.json`.
- These files are local review artifacts only and are not deployed to eBay.

### Image Candidate Discovery - 2026-05-07
- `scripts/find-ebay-images.mjs` finds image candidates for each local listing and writes review artifacts only.
- Output written to `scratch/ebay-images/`: `image-candidates.json` and `index.html`.
- Discovery result: 88/88 parts have at least one candidate image; 79/88 top candidates came from preferred manufacturer/distributor-style domains; 0/88 top candidates came from blocked marketplace/social domains.
- `scripts/export-ebay-html.mjs --image-manifest=scratch/ebay-images/image-candidates.json` produced `scratch/ebay-html-with-images/` with 88 image-enhanced HTML previews and `listings.with-images.json`.
- Image candidates still require operator approval and image-use rights before any live marketplace use. Prefer original Roadrunner photos for final eBay listings when available.

### Backlog Parts List
WE21X20562	Drum Asm 6.0 (replacement)	503
WE21X20407	Drum Asm 6.0 Cu.ft Wh	503
WE19M1713	Backsplash Graphics Asm	13
WE11M10001	Dryer Heating Element	514
WE11X20397	G.e. Dryer Heating Element	512
WE17X22217	Dryer Drive Motor With Pulley	630
WE17M66	Motor	630
WE20X20596	Panel	420
WE4M160	Dryer Safety Thermostat	505
WE4M532	Dryer Timer	100
WE49X22295	Dryer Door Inner Panel	305
WE10X20418	Inner Door Asm White	305
WE20X20409	Front Panel "White"	301
WE20X20412	Bottom Cover	222
WE03X20434	Dryer Idler Pulley Arm	215
WE20X20417	Dryer Top Panel	401
WE20X20396	Rear Panel	420
WE4M137	Dryer High-limit Thermostat	507
WE20X20391	Chassis Base	408
WE49X22294	End Cap Rh W	4
WE14X20392	Dryer Blower Housing	219
WE19M1481	Dryer Control Panel Cover, Rear	72
WE10X20468	Dryer Door Outer Panel (white)	307
WE4M181	Dryer Operating Thermostat	506
WE19M1478	End Cap Lh Wh	3
WE16X20393	Laundry Center Dryer Blower Wheel	201
WE18X25100	Dryer Lint Screen	300
WE18M28	Filter & Mesh Asm.	300
WE14X20425	Trap Duct	311
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
WE14X20421	Dryer Exhaust Duct	228
WE1M1007	Cover Fuse Terminal	430
WE3M56	Bearing	313
WE03X20228	Top Bearing	313
WE4M415	Dryer Door Switch	380
WE1M462	Kenmore Dryer Rear Bearing	3106
WE11X20400	Heater Housing	513
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
