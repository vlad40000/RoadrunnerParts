import os
import re
import json

files = [
    "fix_com_drum.txt",
    "fix_com_front-panel-AND-door.txt",
    "fix_com_backsplash-blower-AND-drive-assembly.txt",
    "fix_com_cabinet-AND-top-panel.txt"
]

target_parts = [
    "WE21X20407", "WE01X20419", "WE02X20442", "WE14X21434",
    "WE01X20420", "WE01X20433", "WE01X20421", "WE01X20428",
    "WE01X20436", "WE01X20431", "WE01X20437"
]

results = []

def parse_data_args(args_str):
    parts = args_str.split('|')
    if len(parts) < 7:
        return None
    return {
        "fixNumber": "FIX" + parts[0],
        "partName": parts[1],
        "retailPriceUsd": parts[2],
        "availability": parts[5],
        "partNumber": parts[6]
    }

for filename in files:
    if not os.path.exists(filename):
        continue
    
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Find all js-mega-m-part divs
    # We want to capture the whole div to extract image URLs and the snippet
    # Since HTML parsing with regex is hard, we'll look for part numbers in data-args first
    
    # Example: data-args="9493090|DRUM Assembly|405.7600|1|2|SpecialOrder|WE21X20562|HTDX100ED3WW|0.0000|1|0|0"
    matches = re.finditer(r'class="[^"]*js-mega-m-part[^"]*".*?data-args="([^"]+)"', content, re.DOTALL)
    
    # We also need to find the specific block to get image URLs and the snippet
    # Let's find all js-mega-m-part blocks more reliably
    # Usually they are col-12 mb-3 js-mega-m-part or similar
    blocks = re.findall(r'<div class="[^"]*js-mega-m-part[^"]*".*?</div>\s*</div>\s*</div>', content, re.DOTALL)
    
    for block in blocks:
        args_match = re.search(r'data-args="([^"]+)"', block)
        if args_match:
            args_data = parse_data_args(args_match.group(1))
            if args_data:
                # Check if this part or any part it replaces matches our target
                found = False
                if args_data['partNumber'] in target_parts:
                    found = True
                else:
                    # Check for "Replaces WE..." in the block
                    for target in target_parts:
                        if f"Replaces {target}" in block:
                            found = True
                            args_data['replacedPartNumber'] = target
                            break
                
                if found:
                    # Extract image URLs
                    img_urls = re.findall(r'data-src="([^"]+)"', block)
                    if not img_urls:
                        img_urls = re.findall(r'src="([^"]+)"', block)
                    
                    # Extract partUrl
                    url_match = re.search(r'href="([^"]+)"', block)
                    part_url = "https://www.fix.com" + url_match.group(1) if url_match else ""
                    
                    # Section URL (based on filename)
                    section_url = ""
                    if "drum" in filename:
                        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863270/drum/"
                    elif "front-panel-AND-door" in filename:
                        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863268/front-panel-AND-door/"
                    elif "backsplash" in filename:
                        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/"
                    elif "cabinet" in filename:
                        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863269/cabinet-AND-top-panel/"

                    results.append({
                        "fixNumber": args_data['fixNumber'],
                        "retailPriceUsd": args_data['retailPriceUsd'],
                        "availability": args_data['availability'],
                        "sectionUrl": section_url,
                        "partUrl": part_url,
                        "brand": "Hotpoint/GE", # Defaulting as it's for this model
                        "partName": args_data['partName'],
                        "partNumber": args_data['partNumber'],
                        "imageUrls": list(set(img_urls)),
                        "sourceHtmlSnippet": block.strip(),
                        "replacedPartNumber": args_data.get('replacedPartNumber')
                    })

print(json.dumps(results, indent=2))
