import os
import re
import json

files = [
    "fix_com_drum.txt",
    "fix_com_front-panel-AND-door.txt",
    "fix_com_backsplash-blower-AND-drive-assembly.txt",
    "fix_com_cabinet-AND-top-panel.txt"
]

results = {}

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
        print(f"File not found: {filename}")
        continue
    
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Use regex to find all js-mega-m-part blocks
    # A block starts with <div class="...js-mega-m-part..." and ends with the closing div of the part info
    # This is tricky because of nested divs. 
    # Let's try to find the js-mega-m-part div and then everything until the next one or end of list
    
    parts_matches = re.finditer(r'<div class="[^"]*js-mega-m-part[^"]*".*?(?=<div class="[^"]*js-mega-m-part[^"]*"|<!--\s*sidebar\s*-->|</footer>|$)', content, re.DOTALL)
    
    for match in parts_matches:
        block = match.group(0)
        args_match = re.search(r'data-args="([^"]+)"', block)
        if args_match:
            data = parse_data_args(args_match.group(1))
            if data:
                pn = data['partNumber']
                
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

                # Check if it replaces anything
                replaces = re.findall(r'Replaces\s+([A-Z0-9]+)', block)
                
                res = {
                    "fixNumber": data['fixNumber'],
                    "retailPriceUsd": data['retailPriceUsd'],
                    "availability": data['availability'],
                    "sectionUrl": section_url,
                    "partUrl": part_url,
                    "brand": "Hotpoint/GE",
                    "partName": data['partName'],
                    "partNumber": pn,
                    "imageUrls": list(set(img_urls)),
                    "sourceHtmlSnippet": block.strip(),
                    "replaces": replaces
                }
                
                results[pn] = res
                for rpn in replaces:
                    if rpn not in results:
                        results[rpn] = res

# Parts requested by user
target_parts = [
    "WE21X20407", "WE01X20419", "WE02X20442", "WE14X21434",
    "WE01X20420", "WE01X20433", "WE01X20421", "WE01X20428",
    "WE01X20436", "WE01X20431", "WE01X20437"
]

final_output = []
for tp in target_parts:
    if tp in results:
        final_output.append(results[tp])
    else:
        # Check if the part number is in the block text anywhere if not found in data-args
        # (Sometimes it's in the description but not data-args)
        pass

print(json.dumps(final_output, indent=2))
