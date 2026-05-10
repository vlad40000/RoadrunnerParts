import json
import os
import re
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Load API key from .env.local if present
try:
    with open(".env.local", "r") as f:
        for line in f:
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip('"\'')
except Exception:
    pass

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

def extract_ebay_listing(cleaned_html: str, target_donor_model: str, client: genai.Client) -> dict:
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
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=EbayListingTemplate,
                temperature=1.0
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"  [!] Gemini Extraction Failed: {e}")
        return None

if __name__ == "__main__":
    client = genai.Client()
    filename = "fix_com_cabinet-AND-top-panel.txt"
    target_model = "HTDX100ED3WW"
    
    print(f"Processing {filename} for donor model {target_model}...")
    with open(filename, "r", encoding="utf-8") as f:
        html = f.read()
    
    cleaned = re.sub(
        r'<(script|style|svg|header|footer|nav)\b[^<]*(?:(?!</\1>)<[^<]*)*</\1>', 
        '', 
        html, 
        flags=re.IGNORECASE
    )
    cleaned = cleaned[:40000]
    
    res = extract_ebay_listing(cleaned, target_model, client)
    print("\nExtraction Result with Trust Shard & HTML Block:")
    print(json.dumps(res, indent=2))
