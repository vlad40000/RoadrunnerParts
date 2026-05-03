from playwright.sync_api import sync_playwright
from typing import Dict, Any

def capture_rendered_dom(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1600, "height": 1200},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
        )
        page = context.new_page()
        page.goto(url, wait_until="networkidle", timeout=60000)
        
        # Wait for common parts table selectors if needed
        # page.wait_for_selector(".parts-list", timeout=5000)
        
        content = page.content()
        browser.close()
        return content
