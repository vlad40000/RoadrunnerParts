"""
reconcile_fix_com.py
Navigate directly to the HTDX100ED3WW Fix.com model page, enumerate all
section URLs, then search each section's HTML for the 17 still-missing parts.
Saves results to scratch/fix_com_reconciliation_results.json.
"""
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
from urllib.parse import urljoin
import json

MODEL_URL = "https://www.fix.com/models/dryer/hotpoint/id849531/htdx100ed3ww/"

MISSING_PARTS = [
    "WE21X20407", "WE10X20418", "WE18M28", "WE12X21574", "WE13X30697",
    "WD21X557", "WH2M270", "WE09X20441", "WE3M51", "WE1M1101",
    "WE3M52", "WE12X20395", "WE1M966", "WE1M536", "WE1M505",
    "WZ05X0158", "WE00X1811",
]

OUTPUT = "scratch/fix_com_reconciliation_results.json"


def visible_text(locator):
    try:
        if locator.count() and locator.first.is_visible():
            return locator.first.inner_text().strip()
    except Exception:
        return ""
    return ""


def run():
    with Stealth().use_sync(sync_playwright()) as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/121.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()

        # --- 1. Load model page and collect all section URLs ---
        print(f"Loading model page: {MODEL_URL}")
        page.goto(MODEL_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)

        links = page.query_selector_all("a[href*='/section']")
        sections = []
        seen = set()
        for link in links:
            href = link.get_attribute("href")
            name = link.inner_text().strip().split("\n")[0].strip()
            if not href:
                continue
            full_url = urljoin(MODEL_URL, href)
            if "/section" in full_url and full_url not in seen and name:
                sections.append({"name": name, "url": full_url})
                seen.add(full_url)

        print(f"Found {len(sections)} sections.")
        if not sections:
            print("ERROR: No sections found. Exiting.")
            browser.close()
            return

        # Track results per part
        results = {pn: {"partNumber": pn, "found": False, "sections_checked": []} for pn in MISSING_PARTS}

        # --- 2. Scrape each section ---
        for sec in sections:
            print(f"  Section: {sec['name']} -> {sec['url']}")
            try:
                page.goto(sec["url"], wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(2000)

                # Click "View More" until exhausted
                while True:
                    vm = page.locator("text=/View More/i").first
                    try:
                        if vm.is_visible(timeout=2000):
                            print("    Clicking View More...")
                            vm.click()
                            page.wait_for_timeout(2000)
                        else:
                            break
                    except Exception:
                        break

                html = page.content()

                for pn in MISSING_PARTS:
                    results[pn]["sections_checked"].append(sec["name"])
                    if pn in html and not results[pn]["found"]:
                        # Try to extract the part container
                        container = page.locator(
                            f'.js-mega-m-part:has-text("{pn}"), .mega-m__part:has-text("{pn}")'
                        ).first
                        part_name = ""
                        price = ""
                        href = None
                        try:
                            part_name = visible_text(container.locator(".mega-m__part__name"))
                            price = visible_text(container.locator(".price"))
                            href = container.locator('a[href*="/parts/"]').first.get_attribute("href")
                        except Exception:
                            pass

                        results[pn].update({
                            "found": True,
                            "status": "source_backed_match",
                            "partName": part_name,
                            "price": price or "N/A",
                            "section": sec["name"],
                            "sectionUrl": sec["url"],
                            "url": urljoin(sec["url"], href) if href else sec["url"],
                            "sourceHtmlSnippet": html[max(0, html.find(pn) - 200): html.find(pn) + 500],
                        })
                        print(f"    FOUND: {pn} - {part_name} - {price}")

            except Exception as e:
                print(f"  ERROR on section {sec['name']}: {e}")

        # Mark unfound parts
        for pn, r in results.items():
            if not r["found"]:
                r["status"] = "not_found_on_fix_com"
                print(f"NOT FOUND: {pn}")

        out = list(results.values())
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)

        found_count = sum(1 for r in out if r["found"])
        print(f"\nDone. {found_count}/{len(MISSING_PARTS)} parts found.")
        print(f"Results saved to {OUTPUT}")
        browser.close()


if __name__ == "__main__":
    run()
