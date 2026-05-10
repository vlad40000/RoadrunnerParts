import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth


DEFAULT_URL = "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/section6863267/backsplash-blower-AND-drive-assembly/"


def inspect_fix_com(url, output_path="fix_com_inspect.html", headful=False):
    with Stealth().use_sync(sync_playwright()) as p:
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

            content = page.content()

            # Save the full content to a file for manual inspection if needed.
            output = Path(output_path)
            output.write_text(content, encoding="utf-8")

            print(f"DOM dumped to {output}")

            # Print some interesting tags.
            for selector in [".part-list", "#parts-list", ".section-parts", "[data-part-number]", ".part-container"]:
                elements = page.locator(selector)
                count = elements.count()
                print(f"Selector '{selector}' found {count} times.")
                if count > 0:
                    print(f"  Example text: {elements.first.inner_text(timeout=5000)[:100]}...")
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
    parser = argparse.ArgumentParser(description="Inspect a Fix.com rendered section page.")
    parser.add_argument("url", nargs="?", default=DEFAULT_URL)
    parser.add_argument("--output", default="fix_com_inspect.html")
    parser.add_argument("--headful", action="store_true", help="Launch a visible browser for operator debugging.")
    args = parser.parse_args()

    inspect_fix_com(args.url, output_path=args.output, headful=args.headful)
