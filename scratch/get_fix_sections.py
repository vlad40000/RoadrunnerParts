import os
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from urllib.parse import urljoin

def get_fix_sections(model_url):
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        print(f"Navigating to {model_url}...")
        try:
            # Increase timeout and wait for domcontentloaded
            page.goto(model_url, wait_until="domcontentloaded", timeout=60000)
            # Wait for any section link to appear
            page.wait_for_selector("a[href*='/section']", timeout=15000)
        except Exception as e:
            print(f"Warning during navigation/wait: {e}")
        
        # Find section links
        links = page.query_selector_all("a[href*='/section']")
        sections = []
        seen_urls = set()
        
        for link in links:
            url = link.get_attribute("href")
            name = link.inner_text().strip()
            if not url: continue
            full_url = urljoin(model_url, url)
            if "/section" in full_url and full_url not in seen_urls:
                # Clean name: remove "Parts for this section" and other garbage
                name = name.split('\n')[0].strip()
                if name and "parts for this" not in name.lower():
                    sections.append({"name": name, "url": full_url})
                    seen_urls.add(full_url)
        
        browser.close()
        return sections

if __name__ == "__main__":
    model_url = "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/"
    sections = get_fix_sections(model_url)
    print(f"\nFound {len(sections)} sections:")
    for s in sections:
        print(f"- {s['name']}: {s['url']}")
    
    import json
    with open("fix_sections.json", "w") as f:
        json.dump(sections, f, indent=2)
