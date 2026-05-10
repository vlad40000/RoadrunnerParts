import os
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

def check_selector_size(url):
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".js-parts", timeout=30000)
        
        html = page.locator(".js-parts").inner_html()
        print(f"Size of .js-parts inner_html: {len(html)} chars")
        
        # Check if js-mega-m-part blocks are inside
        parts = page.locator(".js-mega-m-part").count()
        print(f"Number of .js-mega-m-part elements: {parts}")
        
        browser.close()

if __name__ == "__main__":
    url = "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/"
    check_selector_size(url)
