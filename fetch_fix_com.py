from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import argparse


def get_fix_com_html(url: str, headful: bool = False) -> str:
    with Stealth().use_sync(sync_playwright()) as p:
        # Use --headful only for manual operator debugging if Fix.com challenges headless runs.
        browser = p.chromium.launch(headless=not headful)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        context.set_default_timeout(15000)
        page = None

        try:
            page = context.new_page()

            print(f"Navigating to {url}...")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("load", timeout=15000)
            except Exception:
                pass

            # Wait for the specific Fix.com parts container to load.
            print("Waiting for parts table to populate...")
            try:
                # Fix.com usually wraps their lists in an element with an id like 'parts-list'
                # or a specific class. Update this selector if they change their UI.
                page.wait_for_selector(".js-parts, .section-parts__part-list, .part-list, #parts-list", timeout=15000)

                # Extract just the parts container to save token space.
                html_content = page.locator(".js-parts, .section-parts__part-list, .part-list, #parts-list").first.inner_html(timeout=5000)
                print("Extraction successful!")
                return html_content
            except Exception as e:
                print(f"Timeout or selector not found. Dumping full body fallback. Error: {e}")
                return page.locator("body").inner_html(timeout=5000)
        finally:
            if page:
                try:
                    page.close()
                except Exception:
                    pass
            try:
                context.close()
            finally:
                browser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch rendered Fix.com section HTML.")
    parser.add_argument("--headful", action="store_true", help="Launch a visible browser for operator debugging.")
    args = parser.parse_args()

    urls = [
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863269/cabinet-AND-top-panel/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863270/drum/",
        "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863268/front-panel-AND-door/"
    ]
    
    for url in urls:
        section_name = url.strip("/").split("/")[-1]
        raw_html = get_fix_com_html(url, headful=args.headful)
        
        filename = f"fix_com_{section_name}.txt"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(raw_html)
            
        print(f"Saved {len(raw_html)} characters to {filename}\n")
