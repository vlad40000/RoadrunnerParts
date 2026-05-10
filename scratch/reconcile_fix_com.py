from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import json

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
        
        # 1. Start from fix.com and search for the model
        print("Navigating to Fix.com...")
        page.goto("https://www.fix.com", wait_until="networkidle")
        
        print("Searching for model HTDX100ED3WW...")
        page.fill('input[name="SearchTerm"]', "HTDX100ED3WW")
        page.press('input[name="SearchTerm"]', "Enter")
        page.wait_for_load_state("networkidle")
        
        # Check if we landed on the model page or a search results page
        if "/models/" not in page.url:
            print("Selecting model from results...")
            model_link = page.locator('a[href*="htdx100ed3ww"]').first
            if model_link.is_visible():
                model_link.click()
                page.wait_for_load_state("networkidle")
        
        print(f"Current URL: {page.url}")
        
        # 2. Extract sections
        sections = page.locator('a[href*="/section/"]').all()
        section_data = []
        for s in sections:
            href = s.get_attribute("href")
            name = s.inner_text()
            if href:
                section_data.append({"name": name, "url": page.evaluate(f'new URL("{href}", window.location.href).href')})
        
        print(f"Found {len(section_data)} sections.")
        
        # 3. For each section, search for parts
        for section in section_data:
            print(f"Checking section: {section['name']}...")
            page.goto(section['url'], wait_until="networkidle")
            
            # Click "View More" until all parts are visible
            while True:
                view_more = page.locator('text=/View More/i').first
                if view_more.is_visible():
                    print("Clicking View More...")
                    view_more.click()
                    page.wait_for_timeout(2000)
                else:
                    break
            
            html = page.content()
            for part_num in missing_parts:
                if part_num in html:
                    # Find the container
                    # Fix.com structure: <div class="js-mega-m-part" data-name="...">
                    container = page.locator(f'.js-mega-m-part:has-text("{part_num}"), .mega-m__part:has-text("{part_num}")').first
                    if container.is_visible():
                        part_name = container.locator('.mega-m__part__name').inner_text()
                        price = container.locator('.price').inner_text()
                        
                        results.append({
                            "partNumber": part_num,
                            "partName": part_name.strip(),
                            "price": price.strip(),
                            "section": section['name'],
                            "sectionUrl": section['url'],
                            "found": True
                        })
                        print(f"FOUND: {part_num} - {part_name.strip()} - {price.strip()}")
        
        # Save results
        with open("scratch/fix_com_reconciliation_results.json", "w") as f:
            json.dump(results, f, indent=2)
            
        browser.close()

if __name__ == "__main__":
    run()
