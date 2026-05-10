import os
import json
import re
import time
import sys
import argparse
from html import unescape
from pathlib import Path
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

sys.path.append(os.path.join(os.path.dirname(__file__), "rld"))
from token_thermostat import TokenThermostat

# Auto-load the GEMINI_API_KEY from .env.local if present
try:
    with open(".env.local", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip('"\'')
except Exception:
    pass


TARGET_MODEL = "HTDX100ED3WW"

FIX_SECTION_SOURCES = [
    {
        "section": "BACKSPLASH, BLOWER & DRIVE ASSEMBLY",
        "url": "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/",
        "cache": "fix_com_backsplash-blower-AND-drive-assembly.txt",
    },
    {
        "section": "CABINET & TOP PANEL",
        "url": "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863269/cabinet-AND-top-panel/",
        "cache": "fix_com_cabinet-AND-top-panel.txt",
    },
    {
        "section": "DRUM",
        "url": "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863270/drum/",
        "cache": "fix_com_drum.txt",
    },
    {
        "section": "FRONT PANEL & DOOR",
        "url": "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863268/front-panel-AND-door/",
        "cache": "fix_com_front-panel-AND-door.txt",
    },
]

PART_NUMBER_RE = re.compile(r"\b(?:WE|WD|WH|WZ)\d[A-Z0-9]*\b", re.IGNORECASE)

# ==============================================================================
# 1. STRUCTURAL CONTRACTS (PYDANTIC)
# ==============================================================================
class EbayListingTemplate(BaseModel):
    # --- PHASE 1B: STRICT DATA EXTRACTION ---
    title: str = Field(description="Highly optimized eBay title (max 80 chars) including Brand, Part Name, and OEM Part Number.")
    brand: str = Field(description="Exact manufacturer brand name.")
    oem_part_number: str = Field(description="Exact OEM manufacturer part number.")
    donor_machine_model: str = Field(description="The source/donor machine model number this part was verified against (Provenance).")
    replaces_part_numbers: list[str] = Field(description="List of superseded or replaced part numbers.")
    symptoms_fixed: list[str] = Field(description="List of machine symptoms this part fixes.")
    compatible_models: list[str] = Field(description="List of specific appliance model numbers this part fits.")
    retail_price_usd: float = Field(description="Exact retail price listed on the page as a float.", default=0.0)
    image_urls: list[str] = Field(description="List of direct URLs to high-resolution product images.")
    
    # --- PHASE 1C: CREATIVE DELTA & TRUST SHARDS ---
    consumer_description: str = Field(description="A 2-3 sentence consumer-friendly description of the part's physical attributes and function.")
    expert_trust_shard: str = Field(description="An empathetic, expert-level piece of advice regarding the handling, installation, or diagnosis of this specific part (e.g., 'Be careful not to lift the motor by the plastic switch', or 'If your dryer isn't heating, check the thermal fuse before replacing this board').")
    
    # --- HTML POLICY COMPLIANCE ---
    html_description_block: str = Field(description="A clean, inline-styled HTML string combining the consumer description, symptoms fixed, and expert_trust_shard, ready for direct injection into eBay's description box. Do NOT include <script> or active content.")

# ==============================================================================
# 2. TOKEN STEWARDSHIP (HTML CLEANING)
# ==============================================================================
def clean_html_payload(html: str) -> str:
    """
    Surgical HTML Cleaning to reduce token noise.
    Strips script, style, svg, header, footer, and nav tags.
    """
    cleaned = re.sub(
        r'<(script|style|svg|header|footer|nav)\b[^<]*(?:(?!</\1>)<[^<]*)*</\1>', 
        '', 
        html, 
        flags=re.IGNORECASE
    )
    # Cap at 40,000 characters to protect context window limits
    return cleaned[:40000]


def normalize_part_number(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def parse_price(value: str) -> float:
    try:
        return float(re.sub(r"[^0-9.]", "", str(value or "")) or 0)
    except ValueError:
        return 0.0


def html_attr(text: str, name: str) -> str:
    match = re.search(rf'\b{name}="([^"]*)"', text, flags=re.IGNORECASE)
    return unescape(match.group(1)).strip() if match else ""


def text_from_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


def absolute_fix_url(href: str) -> str:
    href = unescape(href or "").strip()
    if not href:
        return ""
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return f"https://www.fix.com{href}"
    return href


def parse_backlog_parts(state_file: str) -> list[dict]:
    text = Path(state_file).read_text(encoding="utf-8")
    backlog_started = False
    rows = []

    for line in text.splitlines():
        if line.strip().lower() == "### backlog parts list":
            backlog_started = True
            continue
        if not backlog_started:
            continue

        raw = line.strip()
        if not raw:
            continue

        columns = re.split(r"\t+", raw)
        if len(columns) >= 3:
            part_number, name, diagram_ref = columns[0], columns[1], columns[2]
        else:
            match = re.match(r"^([A-Z]{2,3}\d[A-Z0-9]+)\s+(.+?)\s+([A-Z0-9]+)$", raw, flags=re.IGNORECASE)
            if not match:
                continue
            part_number, name, diagram_ref = match.groups()

        normalized_part = normalize_part_number(part_number)
        replacements = [
            normalize_part_number(item)
            for item in PART_NUMBER_RE.findall(name)
            if normalize_part_number(item) != normalized_part
        ]
        rows.append({
            "partNumber": normalized_part,
            "description": name.strip(),
            "diagramRef": str(diagram_ref).strip(),
            "matchPartNumbers": [normalized_part, *replacements],
        })

    return rows


def split_fix_part_blocks(html_text: str) -> list[str]:
    starts = list(re.finditer(r'<div class="[^"]*\bjs-mega-m-part\b[^"]*"[^>]*>', html_text, flags=re.IGNORECASE))
    blocks = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1].start() if idx + 1 < len(starts) else len(html_text)
        blocks.append(html_text[start.start():end])
    return blocks


def parse_fix_part_block(block: str, source: dict) -> dict | None:
    data_args = html_attr(block, "data-args")
    fields = data_args.split("|") if data_args else []
    part_number = normalize_part_number(fields[6] if len(fields) > 6 else "")
    if not part_number:
        match = re.search(r"Part Number:\s*([A-Z0-9]+)", unescape(block), flags=re.IGNORECASE)
        part_number = normalize_part_number(match.group(1) if match else "")
    if not part_number:
        return None

    name = fields[1].strip() if len(fields) > 1 else ""
    if not name:
        name_match = re.search(r'class="[^"]*\bmega-m__part__name\b[^"]*"[^>]*>(.*?)</a>', block, flags=re.IGNORECASE | re.DOTALL)
        name = text_from_html(name_match.group(1) if name_match else html_attr(block, "data-name"))

    price = parse_price(fields[2] if len(fields) > 2 else "")
    availability = fields[5].strip() if len(fields) > 5 else ""
    brand = html_attr(block, "data-item-brand")
    fix_number = f"FIX{fields[0]}" if fields else ""
    model = fields[7].strip() if len(fields) > 7 else ""

    order_match = re.search(r'class="[^"]*\bjs-o-num\b[^"]*"[^>]*>(.*?)</span>', block, flags=re.IGNORECASE | re.DOTALL)
    diagram_ref = text_from_html(order_match.group(1) if order_match else "")

    href_match = re.search(r'href="([^"]*/parts/[^"]+)"', block, flags=re.IGNORECASE)
    part_url = absolute_fix_url(href_match.group(1) if href_match else "")

    image_urls = []
    for image_url in re.findall(r'(?:data-src|data-temp|src)="([^"]+)"', block, flags=re.IGNORECASE):
        clean = unescape(image_url).strip()
        if clean.startswith("http") and clean not in image_urls:
            image_urls.append(clean)

    return {
        "status": "matched",
        "source": "fix.com",
        "section": source["section"],
        "sectionUrl": source["url"],
        "cacheFile": source["cache"],
        "partNumber": part_number,
        "partName": text_from_html(name),
        "brand": brand,
        "fixNumber": fix_number,
        "model": model,
        "diagramRef": diagram_ref,
        "availability": availability,
        "retailPriceUsd": price,
        "partUrl": part_url,
        "imageUrls": image_urls,
        "sourceHtmlSnippet": clean_html_payload(block)[:12000],
    }


def extract_fix_parts_from_html(html_text: str, source: dict) -> list[dict]:
    parts = []
    seen = set()
    for block in split_fix_part_blocks(html_text):
        part = parse_fix_part_block(block, source)
        if not part:
            continue
        key = (part["partNumber"], part["section"], part.get("diagramRef", ""))
        if key in seen:
            continue
        seen.add(key)
        parts.append(part)
    return parts


def load_fix_part_index(refresh_html: bool = False, headful: bool = False) -> dict[str, list[dict]]:
    raw_by_source = {}
    missing_sources = []
    for source in FIX_SECTION_SOURCES:
        cache_path = Path(source["cache"])
        if cache_path.exists() and not refresh_html:
            raw_by_source[source["cache"]] = cache_path.read_text(encoding="utf-8", errors="replace")
        else:
            missing_sources.append(source)

    if missing_sources:
        with Stealth().use_sync(sync_playwright()) as p:
            browser = p.chromium.launch(headless=not headful)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            context.set_default_timeout(15000)
            try:
                for source in missing_sources:
                    html_text = fetch_rendered_html(source["url"], context)
                    raw_by_source[source["cache"]] = html_text
                    Path(source["cache"]).write_text(html_text, encoding="utf-8")
            finally:
                try:
                    context.close()
                finally:
                    browser.close()

    index: dict[str, list[dict]] = {}
    for source in FIX_SECTION_SOURCES:
        for part in extract_fix_parts_from_html(raw_by_source.get(source["cache"], ""), source):
            index.setdefault(part["partNumber"], []).append(part)
    return index


def match_backlog_to_fix_evidence(backlog_parts: list[dict], fix_index: dict[str, list[dict]]) -> list[dict]:
    rows = []
    for item in backlog_parts:
        evidence = None
        matched_number = None
        for candidate_number in item["matchPartNumbers"]:
            matches = fix_index.get(candidate_number, [])
            if matches:
                evidence = matches[0]
                matched_number = candidate_number
                break
        rows.append({
            **item,
            "status": "matched" if evidence else "missing_fix_com_evidence",
            "matchedPartNumber": matched_number,
            "fixComEvidence": evidence,
        })
    return rows


def write_json(path: str, payload) -> None:
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")

# ==============================================================================
# 3. PLAYWRIGHT DOM EXTRACTION
# ==============================================================================
def fetch_rendered_html(url: str, browser_context) -> str:
    """
    Navigates to the part page, waits for the DOM to hydrate, 
    and extracts the main product container.
    """
    page = browser_context.new_page()
    try:
        print(f"  -> Fetching DOM: {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        try:
            page.wait_for_load_state("load", timeout=15000)
        except Exception:
            pass
        
        # Wait for the specific Fix.com parts container to load
        # Fix.com usually wraps their lists in an element with an id like 'parts-list' 
        # or a specific class. Update this selector if they change their UI.
        try:
            page.wait_for_selector(".js-parts, .section-parts__part-list, .part-list, #parts-list", timeout=15000)
            # Extract just the parts container to save token space
            html_content = page.locator(".js-parts, .section-parts__part-list, .part-list, #parts-list").first.inner_html(timeout=5000)
        except Exception as e:
            print(f"  [!] Timeout or selector not found, falling back to body.")
            html_content = page.locator("body").inner_html(timeout=5000)
            
        return html_content
    except Exception as e:
        print(f"  [!] Failed to fetch {url}: {e}")
        return ""
    finally:
        try:
            page.close()
        except Exception:
            pass

# ==============================================================================
# 4. DETERMINISTIC GEMINI PARSER
# ==============================================================================
def extract_ebay_listing(source_material: str, target_donor_model: str, client: genai.Client, thermostat: TokenThermostat = None, ambient_injection: str = "") -> dict:
    """
    Forces the LLM to parse the HTML into the strict EbayListingTemplate schema.
    """
    orchestrator_directive = f"""
    <orchestrator_directive>
    You are operating under STRICT_SEQUENTIAL execution mode. This system utilizes a multi-phase state machine (Phase 0 -> Phase 1A -> Phase 1B/1C).
    You are executing Phase 1B (Extraction) and Phase 1C (Creative Delta). 
    There is zero tolerance for step-skipping, predictive generation, or phase-merging.
    {f'<ambient_injection>{ambient_injection}</ambient_injection>' if ambient_injection else ''}
    </orchestrator_directive>
    """

    system_instruction = f"""
    {orchestrator_directive}

    ROLE: Expert Appliance Technician and E-Commerce Copywriter.

    Mission: Extract rigid factual data (Phase 1B) and generate empathetic, expert-level installation advice (Phase 1C) to build immense buyer trust.

    EXECUTION CONTRACT:
    1. PROVENANCE (Phase 0): The active Donor Machine ID is provided in the user prompt. Inject it exactly as provided into the 'donor_machine_model' field.
    2. EXTRACTION (Phase 1B): Extract Brand, OEM Part Number, Symptoms, Replaces, Compatible Models, and Retail Price STRICTLY from the Source Material. Do not hallucinate models or symptoms. Ignore distributor part numbers (e.g., FIX123).
    3. SOURCE BOUNDARY: The backlog item defines work scope only. The Fix.com evidence object and sourceHtmlSnippet are the source evidence. If a value is not present in Fix.com evidence, use an empty list, empty string, or 0.0 rather than inventing it.
    4. PART NUMBER: Use the evidence partNumber as the OEM part number. If the backlog requested an older replaced number but the evidence matched a replacement, use the matched evidence partNumber and include the older backlog number in replaces_part_numbers only if the source material explicitly supports that relationship.
    5. TRUST SHARD (Phase 1C): Generate the 'expert_trust_shard'. This must be a highly specific, empathetic tip about handling, diagnosing, or installing this exact type of part. Differentiate this listing from massive, automated clearinghouses.
    6. HTML POLICY: Generate a clean, inline-styled 'html_description_block' that is 100% compliant with eBay active-content policies (No Javascript).
    """
    
    prompt = f"Active Donor Machine ID: {target_donor_model}\n\nSource Material:\n{source_material}"
    
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=EbayListingTemplate,
                temperature=1.0 # Maintain standard temperature; rely on Pydantic for structure
            )
        )
        
        output_dict = None
        schema_passed = False
        try:
            output_dict = json.loads(response.text)
            schema_passed = True
        except Exception:
            pass

        if thermostat and getattr(response, "usage_metadata", None):
            tokens = getattr(response.usage_metadata, "total_token_count", 0)
            in_tokens = getattr(response.usage_metadata, "prompt_token_count", 0)
            out_tokens = getattr(response.usage_metadata, "candidates_token_count", 0)
            
            thermostat.record_event(
                tokens=tokens,
                input_tokens=in_tokens,
                output_tokens=out_tokens,
                artifacts_valid=1 if schema_passed else 0,
                artifacts_invalid=0 if schema_passed else 1,
                schema_passed=schema_passed,
                schema_failed=not schema_passed,
            )

        return output_dict
    except Exception as e:
        print(f"  [!] Gemini Extraction Failed: {e}")
        if thermostat:
            thermostat.record_event(error=True)
        return None

# ==============================================================================
# 5. THE ORCHESTRATION LOOP
# ==============================================================================
def run_pipeline(url_list: list, target_model: str, headful: bool = False):
    # Initialize the Gemini Client (Requires GEMINI_API_KEY environment variable)
    ai_client = genai.Client()
    thermostat = TokenThermostat(run_id=f"EBAY-SECTIONS-{int(time.time())}")
    ambient_injection = ""
    
    results = []
    
    print(f"Starting extraction pipeline for {len(url_list)} URLs for model {target_model}...\n")
    
    with Stealth().use_sync(sync_playwright()) as p:
        # Use --headful only for manual operator debugging if Fix.com challenges headless runs.
        browser = p.chromium.launch(headless=not headful)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        context.set_default_timeout(15000)

        try:
            for idx, url in enumerate(url_list, 1):
                print(f"[{idx}/{len(url_list)}] Processing Part...")

                # Step 1: Hydrate and fetch DOM.
                raw_html = fetch_rendered_html(url, context)
                if not raw_html:
                    continue

                # Step 2: Clean the payload.
                cleaned_html = clean_html_payload(raw_html)

                # Step 3: Extract structured JSON.
                print(f"  -> Sending {len(cleaned_html)} chars to Gemini...")
                listing_data = extract_ebay_listing(cleaned_html, target_model, ai_client, thermostat=thermostat, ambient_injection=ambient_injection)

                if thermostat:
                    ping = thermostat.tick()
                    if ping:
                        print(f"  [!] TRIAGE PING: Decay Level {ping.decay_level} ({ping.leak_pattern})")
                        injection = thermostat.apply_relock(ping)
                        ambient_injection = injection.instruction
                        print(f"  [!] Applying Ambient Injection: {ambient_injection}")

                if listing_data:
                    # Append original source URL for tracking.
                    listing_data['source_url'] = url
                    results.append(listing_data)
                    print(f"  -> Success: {listing_data.get('oem_part_number')} | {len(listing_data.get('image_urls', []))} images found.")

                # Rate limiting: pause between requests to avoid WAF pressure.
                time.sleep(3)
        finally:
            try:
                context.close()
            finally:
                browser.close()
        
    # Step 4: Save final output to disk
    output_filename = f"{target_model}_ebay_templates.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    if thermostat:
        thermostat.print_dashboard()
        thermostat.close_run()

    print(f"\nPipeline Complete. Saved {len(results)} templates to {output_filename}")


def build_part_source_material(row: dict) -> str:
    evidence = row["fixComEvidence"] or {}
    payload = {
        "backlogItem": {
            "requestedPartNumber": row["partNumber"],
            "description": row["description"],
            "diagramRef": row["diagramRef"],
            "candidatePartNumbers": row["matchPartNumbers"],
        },
        "fixComEvidence": evidence,
        "sourceBoundary": "Use Fix.com evidence for factual fields. Backlog item is work scope only.",
    }
    return json.dumps(payload, indent=2)


def run_backlog_pipeline(
    target_model: str,
    state_file: str,
    headful: bool = False,
    refresh_html: bool = False,
    manifest_only: bool = False,
    limit: int | None = None,
):
    backlog_parts = parse_backlog_parts(state_file)
    if limit:
        backlog_parts = backlog_parts[:limit]

    fix_index = load_fix_part_index(refresh_html=refresh_html, headful=headful)
    rows = match_backlog_to_fix_evidence(backlog_parts, fix_index)
    matched_rows = [row for row in rows if row["status"] == "matched"]
    missing_rows = [row for row in rows if row["status"] != "matched"]

    manifest = {
        "model": target_model,
        "source": "fix.com",
        "stateFile": state_file,
        "counts": {
            "backlogRows": len(rows),
            "matchedFixComEvidence": len(matched_rows),
            "missingFixComEvidence": len(missing_rows),
            "fixComIndexedParts": sum(len(value) for value in fix_index.values()),
            "fixComUniquePartNumbers": len(fix_index),
        },
        "rows": rows,
    }
    manifest_path = f"{target_model}_fix_com_backlog_manifest.json"
    write_json(manifest_path, manifest)
    print(
        f"Backlog manifest saved to {manifest_path}: "
        f"{len(matched_rows)} matched, {len(missing_rows)} missing."
    )

    if manifest_only:
        return manifest

    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is required to generate eBay templates. Use --manifest-only for coverage only.")

    ai_client = genai.Client()
    thermostat = TokenThermostat(run_id=f"EBAY-BACKLOG-{int(time.time())}")
    ambient_injection = ""
    results = []
    skipped = []

    for idx, row in enumerate(rows, 1):
        if row["status"] != "matched":
            skipped.append({
                "partNumber": row["partNumber"],
                "description": row["description"],
                "reason": row["status"],
            })
            print(f"[{idx}/{len(rows)}] Skipping {row['partNumber']}: {row['status']}")
            continue

        evidence = row["fixComEvidence"]
        print(
            f"[{idx}/{len(rows)}] Generating listing for "
            f"{row['partNumber']} from Fix.com evidence {evidence.get('partNumber')}"
        )
        listing_data = extract_ebay_listing(build_part_source_material(row), target_model, ai_client, thermostat=thermostat, ambient_injection=ambient_injection)
        
        if thermostat:
            ping = thermostat.tick()
            if ping:
                print(f"  [!] TRIAGE PING: Decay Level {ping.decay_level} ({ping.leak_pattern})")
                injection = thermostat.apply_relock(ping)
                ambient_injection = injection.instruction
                print(f"  [!] Applying Ambient Injection: {ambient_injection}")

        if listing_data:
            listing_data["source_url"] = evidence.get("partUrl") or evidence.get("sectionUrl")
            listing_data["section_url"] = evidence.get("sectionUrl")
            listing_data["section"] = evidence.get("section")
            listing_data["diagram_ref"] = evidence.get("diagramRef") or row["diagramRef"]
            listing_data["backlog_part_number"] = row["partNumber"]
            listing_data["matched_part_number"] = evidence.get("partNumber")
            listing_data["fix_number"] = evidence.get("fixNumber")
            listing_data["source_cache_file"] = evidence.get("cacheFile")
            results.append(listing_data)
        time.sleep(2)

    output = {
        "model": target_model,
        "generatedCount": len(results),
        "skippedCount": len(skipped),
        "listings": results,
        "skipped": skipped,
    }
    output_filename = f"{target_model}_ebay_templates.json"
    write_json(output_filename, output)
    
    if thermostat:
        thermostat.print_dashboard()
        thermostat.close_run()

    print(f"\nPipeline Complete. Saved {len(results)} listings to {output_filename}")
    return output

# ==============================================================================
# 6. EXECUTION
# ==============================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate eBay listing templates from rendered Fix.com section pages.")
    parser.add_argument("--mode", choices=["backlog", "sections"], default="backlog")
    parser.add_argument("--model", default=TARGET_MODEL)
    parser.add_argument("--state-file", default="WORKFLOW_STATE.md")
    parser.add_argument("--headful", action="store_true", help="Launch a visible browser for operator debugging.")
    parser.add_argument("--refresh-html", action="store_true", help="Refetch Fix.com section HTML before indexing.")
    parser.add_argument("--manifest-only", action="store_true", help="Build the source-backed backlog manifest without calling Gemini.")
    parser.add_argument("--limit", type=int, default=None, help="Limit backlog rows for a smoke run.")
    args = parser.parse_args()

    if args.mode == "sections":
        run_pipeline([source["url"] for source in FIX_SECTION_SOURCES], args.model, headful=args.headful)
    else:
        run_backlog_pipeline(
            args.model,
            args.state_file,
            headful=args.headful,
            refresh_html=args.refresh_html,
            manifest_only=args.manifest_only,
            limit=args.limit,
        )
