from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

def get_fix_com_html(url: str) -> str:
    with Stealth().use_sync(sync_playwright()) as p:
        # headless=False is great for debugging to ensure no CAPTCHAs block you
        browser = p.chromium.launch(headless=False) 
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        print(f"Navigating to {url}...")
        page.goto(url, wait_until="domcontentloaded")

        # Wait for the specific Fix.com parts container to load
        print("Waiting for parts table to populate...")
        
        try:
            # Fix.com usually wraps their lists in an element with an id like 'parts-list' 
            # or a specific class. Update this selector if they change their UI.
            page.wait_for_selector(".part-list, #parts-list, .section-parts", timeout=15000)
            
            # Extract just the parts container to save token space
            html_content = page.locator(".part-list, #parts-list, .section-parts").first.inner_html()
            print("Extraction successful!")
            return html_content
        except Exception as e:
            print(f"Timeout or selector not found. Dumping full body fallback. Error: {e}")
            return page.locator("body").inner_html()
        finally:
            browser.close()

if __name__ == "__main__":
    urls = [
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863269/cabinet-AND-top-panel/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863270/drum/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863268/front-panel-AND-door/"
    ]
    
    for url in urls:
        section_name = url.strip("/").split("/")[-1]
        raw_html = get_fix_com_html(url)
        
        filename = f"fix_com_{section_name}.txt"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(raw_html)
            
        print(f"Saved {len(raw_html)} characters to {filename}\n")
