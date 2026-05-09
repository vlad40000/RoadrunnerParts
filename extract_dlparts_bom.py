import requests
from bs4 import BeautifulSoup
import json

def extract_dlparts_bom(internal_id, model_number):
    print(f"Extracting Bill of Materials for {model_number} (ID: {internal_id})...")
    
    url = f"https://www.dlpartscolookup.com/lookup/{internal_id}?site=prod-standard"
    
    # Spoof headers to bypass the direct-access block
    headers = {
        "Referer": "https://www.dlpartsco.com/",
        "Origin": "https://www.dlpartsco.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Connection failed: {e}")
        return None

    soup = BeautifulSoup(response.text, 'html.parser')
    
    parts_list = []
    
    # Target the specific table structure you identified
    rows = soup.select('.partsColumn table.table tbody tr')
    
    if not rows:
        # Fallback if tbody is missing
        rows = soup.select('.partsColumn table.table tr')
        
    for row in rows:
        # Extract Diagram Number
        item_td = row.find('td', class_='itemNumber')
        if not item_td:
            continue # Skip header rows or empty formatting rows
            
        diagram_id = item_td.get_text(strip=True)
        
        # Extract Part Number (cleaning out the anchor tags)
        part_num_td = row.find('td', class_='partNumber')
        part_number = part_num_td.get_text(strip=True) if part_num_td else ""
        
        # Extract Description and handle Replaces span
        desc_td = row.find('td', class_='description')
        description = ""
        supersedes = ""
        
        if desc_td:
            # Check for superseded info first before we strip the full text
            replaces_span = desc_td.find('span')
            if replaces_span and "(Replaces:" in replaces_span.text:
                supersedes = replaces_span.get_text(strip=True).replace("(Replaces:", "").replace(")", "").strip()
                # Remove the span from the DOM tree so it doesn't get merged into the main description
                replaces_span.extract()
            
            description = desc_td.get_text(strip=True)

        # Extract Pricing and Availability (they share the same class name)
        price_tds = row.find_all('td', class_='priceRight')
        price = price_tds[0].get_text(strip=True) if len(price_tds) > 0 else ""
        availability = price_tds[1].get_text(strip=True) if len(price_tds) > 1 else ""

        # Build the final object
        part_data = {
            "model_number": model_number,
            "diagram_id": diagram_id,
            "part_number": part_number,
            "description": description,
            "supersedes": supersedes,
            "price": price,
            "availability": availability
        }
        
        parts_list.append(part_data)

    return parts_list

# Execute the extraction
bom_data = extract_dlparts_bom("236142", "HTDX100ED3WW")

# Output the results
if bom_data:
    print(f"Successfully extracted {len(bom_data)} parts.")
    with open(f"BOM_HTDX100ED3WW.json", "w") as f:
        json.dump(bom_data, f, indent=4)
    print("Saved to BOM_HTDX100ED3WW.json")
