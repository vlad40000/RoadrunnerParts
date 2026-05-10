from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import json
import time

missing_parts = [
    "WE21X20407", "WE10X20418", "WE18M28", "WE12X21574", "WE13X30697",
    "WD21X557", "WH2M270", "WE09X20441", "WE3M51", "WE1M1101",
    "WE3M52", "WE12X20395", "WE1M966", "WE1M536", "WE1M505",
    "WZ05X0158", "WE00X1811"
]

def run():
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        results = []
        
        for part_num in missing_parts:
            print(f"Searching for {part_num}...")
            url = f"https://www.fix.com/parts/search/?SearchTerm={part_num}"
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(2000) # Give it a moment to render
                
                html = page.content()
                if part_num in html:
                    # Look for part details
                    # If it redirects to a part page, the URL will have /parts/
                    # If it's a list, we'll see multiple.
                    
                    if "/parts/" in page.url:
                        print(f"Direct part page found for {part_num}")
                        part_name = page.locator('h1').inner_text()
                        price_elem = page.locator('.price').first
                        price = price_elem.inner_text() if price_elem.is_visible() else "N/A"
                        
                        results.append({
                            "partNumber": part_num,
                            "partName": part_name.strip(),
                            "price": price.strip(),
                            "url": page.url,
                            "found": True
                        })
                    else:
                        print(f"Search results list found for {part_num}")
                        # Grab the first match
                        container = page.locator(f'.js-mega-m-part:has-text("{part_num}"), .mega-m__part:has-text("{part_num}")').first
                        if container.is_visible():
                            part_name = container.locator('.mega-m__part__name').inner_text()
                            price = container.locator('.price').inner_text()
                            results.append({
                                "partNumber": part_num,
                                "partName": part_name.strip(),
                                "price": price.strip(),
                                "url": page.url,
                                "found": True
                            })
                else:
                    print(f"Part {part_num} NOT found on Fix.com")
            except Exception as e:
                print(f"Error searching for {part_num}: {e}")
        
        # Save results
        with open("scratch/fix_com_search_results.json", "w") as f:
            json.dump(results, f, indent=2)
            
        browser.close()

if __name__ == "__main__":
    run()
