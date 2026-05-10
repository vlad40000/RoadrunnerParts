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

results = {}

for filename in files:
    if not os.path.exists(filename):
        continue
    
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Section URL mapping
    section_url = ""
    if "drum" in filename:
        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863270/drum/"
    elif "front-panel-AND-door" in filename:
        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863268/front-panel-AND-door/"
    elif "backsplash" in filename:
        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/"
    elif "cabinet" in filename:
        section_url = "https://www.fix.com/models/dryer/hotpoint/htdx100ed3ww/section6863269/cabinet-AND-top-panel/"

    # Find all blocks
    blocks = re.split(r'(?=<div class="[^"]*js-mega-m-part[^"]*")', content)
    
    for block in blocks:
        if 'js-mega-m-part' not in block:
            continue
            
        args_match = re.search(r'data-args="([^"]+)"', block)
        if args_match:
            data = parse_data_args(args_match.group(1))
            if data:
                pn = data['partNumber']
                
                # Image URLs
                img_urls = re.findall(r'data-src="([^"]+)"', block)
                if not img_urls:
                    img_urls = re.findall(r'src="([^"]+)"', block)
                
                # Part URL
                url_match = re.search(r'href="([^"]+)"', block)
                part_url = "https://www.fix.com" + url_match.group(1) if url_match else ""
                
                # Replaces
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

# Final extraction
final_results = []
found_parts = set()

for tp in target_parts:
    if tp in results:
        final_results.append(results[tp])
        found_parts.add(tp)
    else:
        # Check if the part number is mentioned in any block
        # (Maybe it's a replacement for something we found but wasn't in the 'replaces' regex)
        for pn, data in results.items():
            if tp in data['sourceHtmlSnippet']:
                # Update the result to show it's linked to this part
                cloned_data = data.copy()
                cloned_data['requestedPartNumber'] = tp
                final_results.append(cloned_data)
                found_parts.add(tp)
                break

print(json.dumps(final_results, indent=2))
print(f"\nFound {len(found_parts)} out of {len(target_parts)} parts.", file=os.sys.stderr)
missing = [tp for tp in target_parts if tp not in found_parts]
if missing:
    print(f"Missing parts: {', '.join(missing)}", file=os.sys.stderr)
