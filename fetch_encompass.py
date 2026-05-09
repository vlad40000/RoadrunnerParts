import requests
import json
import re
import sys

def extract_rsc_json(html_content, key_string):
    """
    Extracts the JSON from Next.js App Router RSC payload.
    """
    scripts = re.findall(r'self\.__next_f\.push\(\[1,\"(.*?)\"\]\)', html_content, re.DOTALL)
    for s in scripts:
        if key_string in s:
            try:
                # Decode unicode escapes
                s_decoded = s.encode('utf-8').decode('unicode_escape')
                start = s_decoded.find('{')
                json_str = s_decoded[start:]
                # Iterate backwards to find valid JSON boundary
                for i in range(len(json_str), 0, -1):
                    try:
                        data = json.loads(json_str[:i])
                        return data
                    except ValueError:
                        pass
            except Exception as e:
                print(f"Error decoding/parsing RSC payload: {e}")
    return None

def extract_encompass_bom(model_number):
    print(f"Resolving and extracting Bill of Materials for: {model_number}...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Connection": "keep-alive"
    }
    
    session = requests.Session()
    session.headers.update(headers)
    
    # 1. Search for the model to find the canonical modelID (e.g. HOTHTDX100ED3WW)
    search_url = f"https://encompass.com/search?searchTerm={model_number}"
    print(f"Querying Search API: {search_url}")
    try:
        response = session.get(search_url, allow_redirects=True)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Connection failed during search: {e}")
        return None

    model_id = None
    
    # Check if we were redirected directly to a model page
    if "/model/" in response.url:
        model_id = response.url.split("/model/")[-1].split("?")[0]
        print(f"Auto-redirected to canonical model ID: {model_id}")
        html_content = response.text
    else:
        # Parse search results RSC payload to find exact match
        data = extract_rsc_json(response.text, "modelResults")
        if not data:
            print("Failed to find search results in RSC payload.")
            return None
            
        try:
            # Navigate nested structure, could vary slightly based on RSC depth
            # Usually searchResults is deep in the tree. We recursively search for it.
            def find_model_results(d):
                if isinstance(d, dict):
                    if 'modelResults' in d:
                        return d['modelResults']
                    for k, v in d.items():
                        res = find_model_results(v)
                        if res: return res
                elif isinstance(d, list):
                    for item in d:
                        res = find_model_results(item)
                        if res: return res
                return None
                
            model_results = find_model_results(data)
            
            if model_results and 'rows' in model_results:
                for row in model_results['rows']:
                    if row.get('modelNumber') == model_number:
                        model_id = row.get('modelID')
                        print(f"Found canonical model ID from search: {model_id}")
                        break
        except Exception as e:
            print(f"Error extracting model ID: {e}")
            
    if not model_id:
        print("Could not resolve a canonical model ID for this model number.")
        return None

    # 2. Fetch the model page using the resolved modelID
    # If we weren't auto-redirected, we need to fetch the model page now
    if "/model/" not in response.url:
        model_url = f"https://encompass.com/model/{model_id}"
        print(f"Fetching Model Page: {model_url}")
        try:
            response = session.get(model_url)
            response.raise_for_status()
            html_content = response.text
        except requests.exceptions.RequestException as e:
            print(f"Connection failed fetching model page: {e}")
            return None

    # 3. Extract parts from the model page RSC payload
    print("Extracting parts from model page RSC payload...")
    data = extract_rsc_json(html_content, "partResults") # Or "model" -> "parts"
    if not data:
        print("Failed to find model data in RSC payload. Trying alternate key...")
        data = extract_rsc_json(html_content, "WE49X22294") # Known part check fallback
        if not data:
            data = extract_rsc_json(html_content, "basePN")
            
    if not data:
        print("Could not find parts in the payload.")
        return None
        
    def find_parts(d):
        if isinstance(d, dict):
            if 'model' in d and 'parts' in d['model']:
                return d['model']['parts']
            for k, v in d.items():
                res = find_parts(v)
                if res: return res
        elif isinstance(d, list):
            for item in d:
                res = find_parts(item)
                if res: return res
        return None

    parts = find_parts(data)
    
    if not parts:
        print("No parts found in the structured data.")
        return []
        
    parts_list = []
    for p in parts:
        parts_list.append({
            "model_number": model_number,
            "part_number": p.get("partNumber", ""),
            "description": p.get("partDescription", ""),
            "image_url": p.get("picturePath", ""),
            "diagram_location": p.get("location", ""),
            "price": p.get("partPrice", ""),
            "availability": f"{p.get('availableQuantity', 0)} in stock" if p.get('availableQuantity', 0) > 0 else "Out of stock"
        })

    return parts_list

if __name__ == "__main__":
    if len(sys.argv) > 1:
        model = sys.argv[1]
    else:
        model = "HTDX100ED3WW"
        print("No model number provided. Defaulting to HTDX100ED3WW.")
        
    encompass_bom = extract_encompass_bom(model)

    if encompass_bom:
        print(f"\nSuccessfully extracted {len(encompass_bom)} parts from Encompass.")
        out_file = f"Encompass_BOM_{model}.json"
        with open(out_file, "w") as f:
            json.dump(encompass_bom, f, indent=4)
        print(f"Saved to {out_file}")
    else:
        print("Extraction failed or no parts found.")
