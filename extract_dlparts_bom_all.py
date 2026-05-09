import requests
from bs4 import BeautifulSoup
import json
import time

def extract_all_dlparts_bom(internal_id, model_number):
    print(f"Extracting Bill of Materials for {model_number} (ID: {internal_id})...")
    
    base_url = f"https://www.dlpartscolookup.com/lookup/{internal_id}?site=prod-standard"
    
    headers = {
        "Referer": "https://www.dlpartsco.com/",
        "Origin": "https://www.dlpartsco.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    try:
        response = requests.get(base_url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Connection failed: {e}")
        return None

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Extract diagram IDs
    diagram_options = soup.select('#diagramsSelect option')
    diagram_urls = []
    
    for opt in diagram_options:
        val = opt.get('value')
        if val: # skips the default "Select Diagram ..." option
            # val is something like "/1603327?site=prod-standard"
            # However, the URL we need is "https://www.dlpartscolookup.com/lookup/236142/1603327?site=prod-standard"
            diagram_id = val.split('?')[0].replace('/', '')
            diagram_urls.append(diagram_id)
            
    print(f"Found {len(diagram_urls)} diagrams to parse.")
    
    all_parts = []
    seen_part_numbers = set()
    
    for diag_id in diagram_urls:
        print(f"Fetching diagram {diag_id}...")
        diag_url = f"https://www.dlpartscolookup.com/lookup/{internal_id}/{diag_id}?site=prod-standard"
        try:
            r = requests.get(diag_url, headers=headers)
            r.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(f"Failed to fetch diagram {diag_id}: {e}")
            continue
            
        d_soup = BeautifulSoup(r.text, 'html.parser')
        rows = d_soup.select('.partsColumn table.table tbody tr')
        if not rows:
            rows = d_soup.select('.partsColumn table.table tr')
            
        for row in rows:
            item_td = row.find('td', class_='itemNumber')
            if not item_td:
                continue 
                
            item_id = item_td.get_text(strip=True)
            
            part_num_td = row.find('td', class_='partNumber')
            part_number = part_num_td.get_text(strip=True) if part_num_td else ""
            
            # Skip empty parts (sometimes there are layout rows)
            if not part_number:
                continue
                
            desc_td = row.find('td', class_='description')
            description = ""
            supersedes = ""
            
            if desc_td:
                replaces_span = desc_td.find('span')
                if replaces_span and "(Replaces:" in replaces_span.text:
                    supersedes = replaces_span.get_text(strip=True).replace("(Replaces:", "").replace(")", "").strip()
                    replaces_span.extract()
                description = desc_td.get_text(strip=True)

            price_tds = row.find_all('td', class_='priceRight')
            price = price_tds[0].get_text(strip=True) if len(price_tds) > 0 else ""
            availability = price_tds[1].get_text(strip=True) if len(price_tds) > 1 else ""

            part_data = {
                "model_number": model_number,
                "diagram_item": item_id,
                "part_number": part_number,
                "description": description,
                "supersedes": supersedes,
                "price": price,
                "availability": availability,
                "diagram_section_id": diag_id
            }
            
            # Use part_number as key to avoid duplicates if parts exist across diagrams
            if part_number not in seen_part_numbers:
                all_parts.append(part_data)
                seen_part_numbers.add(part_number)
                
        # Be nice to their server
        time.sleep(1)

    return all_parts

# Execute the extraction
bom_data = extract_all_dlparts_bom("236142", "HTDX100ED3WW")

if bom_data:
    print(f"Successfully extracted {len(bom_data)} total parts across all diagrams.")
    with open(f"BOM_HTDX100ED3WW_ALL.json", "w") as f:
        json.dump(bom_data, f, indent=4)
    print("Saved to BOM_HTDX100ED3WW_ALL.json")
