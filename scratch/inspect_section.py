import os
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

def inspect_section(url):
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        print(f"Navigating to {url}...")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # Wait for the part list container
            page.wait_for_selector(".js-parts, .mega-m", timeout=30000)
        except Exception as e:
            print(f"Warning during navigation/wait: {e}")
        
        # Save a snippet to check structure if it failed
        html = page.content()
        with open("section_inspect.html", "w", encoding="utf-8") as f:
            f.write(html)
        
        # Try some selectors and print if they match
        selectors = [".js-parts", ".section-parts__part-list", ".part-list", "#parts-list", ".mega-m", ".js-mega-m-part"]
        for s in selectors:
            match = page.locator(s).count()
            print(f"Selector '{s}' found {match} elements.")
            
        browser.close()

if __name__ == "__main__":
    url = "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/"
    inspect_section(url)
