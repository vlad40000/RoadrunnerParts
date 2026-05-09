import os
import json
import re
import time
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Auto-load the GEMINI_API_KEY from .env.local if present
try:
    with open(".env.local", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip('"\'')
except Exception:
    pass

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
        page.goto(url, wait_until="domcontentloaded")
        
        # Wait for the specific Fix.com parts container to load
        # Fix.com usually wraps their lists in an element with an id like 'parts-list' 
        # or a specific class. Update this selector if they change their UI.
        try:
            page.wait_for_selector(".part-list, #parts-list, .section-parts", timeout=15000)
            # Extract just the parts container to save token space
            html_content = page.locator(".part-list, #parts-list, .section-parts").first.inner_html()
        except Exception as e:
            print(f"  [!] Timeout or selector not found, falling back to body.")
            html_content = page.locator("body").inner_html()
            
        return html_content
    except Exception as e:
        print(f"  [!] Failed to fetch {url}: {e}")
        return ""
    finally:
        page.close()

# ==============================================================================
# 4. DETERMINISTIC GEMINI PARSER
# ==============================================================================
def extract_ebay_listing(cleaned_html: str, target_donor_model: str, client: genai.Client) -> dict:
    """
    Forces the LLM to parse the HTML into the strict EbayListingTemplate schema.
    """
    system_instruction = """
    <orchestrator_directive>
    You are operating under STRICT_SEQUENTIAL execution mode. This system utilizes a multi-phase state machine (Phase 0 -> Phase 1A -> Phase 1B/1C).
    You are executing Phase 1B (Extraction) and Phase 1C (Creative Delta). 
    There is zero tolerance for step-skipping, predictive generation, or phase-merging.
    </orchestrator_directive>

    ROLE: Expert Appliance Technician and E-Commerce Copywriter.

    Mission: Extract rigid factual data (Phase 1B) and generate empathetic, expert-level installation advice (Phase 1C) to build immense buyer trust.

    EXECUTION CONTRACT:
    1. PROVENANCE (Phase 0): The active Donor Machine ID is provided in the user prompt. Inject it exactly as provided into the 'donor_machine_model' field.
    2. EXTRACTION (Phase 1B): Extract Brand, OEM Part Number, Symptoms, Replaces, Compatible Models, and Retail Price STRICTLY from the Source Material. Do not hallucinate models or symptoms. Ignore distributor part numbers (e.g., FIX123).
    3. TRUST SHARD (Phase 1C): Generate the 'expert_trust_shard'. This must be a highly specific, empathetic tip about handling, diagnosing, or installing this exact type of part. Differentiate this listing from massive, automated clearinghouses.
    4. HTML POLICY: Generate a clean, inline-styled 'html_description_block' that is 100% compliant with eBay active-content policies (No Javascript).
    """
    
    prompt = f"Active Donor Machine ID: {target_donor_model}\n\nSource Material:\n{cleaned_html}"
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-pro", # Or gemini-3-pro-preview
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=EbayListingTemplate,
                temperature=1.0 # Maintain standard temperature; rely on Pydantic for structure
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"  [!] Gemini Extraction Failed: {e}")
        return None

# ==============================================================================
# 5. THE ORCHESTRATION LOOP
# ==============================================================================
def run_pipeline(url_list: list, target_model: str):
    # Initialize the Gemini Client (Requires GEMINI_API_KEY environment variable)
    ai_client = genai.Client()
    
    results = []
    
    print(f"Starting extraction pipeline for {len(url_list)} URLs for model {target_model}...\n")
    
    with Stealth().use_sync(sync_playwright()) as p:
        # Launch browser (headless=False for fix.com to avoid Akamai blocks)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        for idx, url in enumerate(url_list, 1):
            # Apply stealth to each new page to evade bot detection
            # (stealth_sync is applied per-page inside fetch_rendered_html)
            print(f"[{idx}/{len(url_list)}] Processing Part...")
            
            # Step 1: Hydrate and fetch DOM
            raw_html = fetch_rendered_html(url, context)
            if not raw_html:
                continue
                
            # Step 2: Clean the payload
            cleaned_html = clean_html_payload(raw_html)
            
            # Step 3: Extract structured JSON
            print(f"  -> Sending {len(cleaned_html)} chars to Gemini...")
            listing_data = extract_ebay_listing(cleaned_html, target_model, ai_client)
            
            if listing_data:
                # Append original source URL for tracking
                listing_data['source_url'] = url 
                results.append(listing_data)
                print(f"  -> Success: {listing_data.get('oem_part_number')} | {len(listing_data.get('image_urls', []))} images found.")
            
            # Rate Limiting: Pause for 3 seconds between requests to avoid WAF bans
            time.sleep(3) 

        browser.close()
        
    # Step 4: Save final output to disk
    output_filename = f"{target_model}_ebay_templates.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    print(f"\nPipeline Complete. Saved {len(results)} templates to {output_filename}")

# ==============================================================================
# 6. EXECUTION
# ==============================================================================
if __name__ == "__main__":
    
    target_model = "HTDX100ED3WW"
    
    master_part_urls = [
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863269/cabinet-AND-top-panel/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863270/drum/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863268/front-panel-AND-door/"
    ]
    
    run_pipeline(master_part_urls, target_model)
