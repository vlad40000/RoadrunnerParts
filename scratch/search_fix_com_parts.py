from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import json
from urllib.parse import urljoin, urlparse

MANIFEST_PATH = "HTDX100ED3WW_fix_com_backlog_manifest.json"
OUTPUT_PATH = "scratch/fix_com_search_results.json"


def load_missing_parts():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    return [
        row["partNumber"]
        for row in manifest.get("rows", [])
        if row.get("status") == "missing_fix_com_evidence"
        or row.get("missing_fix_com_evidence") is True
    ]


def visible_text(locator):
    try:
        if locator.count() and locator.first.is_visible():
            return locator.first.inner_text().strip()
    except Exception:
        return ""
    return ""


def is_product_page(url):
    path = urlparse(url).path.lower()
    return path.startswith("/parts/") and not path.startswith("/parts/search")


def parse_part_container(page, part_num):
    container = page.locator(
        f'.js-mega-m-part:has-text("{part_num}"), .mega-m__part:has-text("{part_num}")'
    ).first
    try:
        if not container.is_visible():
            return None
    except Exception:
        return None

    part_name = visible_text(container.locator(".mega-m__part__name"))
    price = visible_text(container.locator(".price"))
    href = container.locator('a[href*="/parts/"]').first.get_attribute("href")
    return {
        "partName": part_name,
        "price": price or "N/A",
        "url": urljoin(page.url, href) if href else page.url,
        "sourceHtmlSnippet": container.evaluate("node => node.outerHTML"),
    }


def parse_product_page(page, part_num):
    h1 = visible_text(page.locator("h1"))
    body_text = page.locator("body").inner_text(timeout=10000)
    if not h1 or h1.lower() == "page not found" or part_num not in body_text:
        return None

    price = visible_text(page.locator(".price"))
    return {
        "partName": h1,
        "price": price or "N/A",
        "url": page.url,
        "sourceHtmlSnippet": page.locator("body").evaluate(
            "node => node.innerHTML.slice(0, 2000)"
        ),
    }

def run():
    missing_parts = load_missing_parts()

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
            result = {
                "partNumber": part_num,
                "found": False,
                "status": "not_found_on_fix_com_search",
                "searchUrl": url,
                "partName": None,
                "price": None,
                "url": None,
            }

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(2000)

                evidence = (
                    parse_product_page(page, part_num)
                    if is_product_page(page.url)
                    else parse_part_container(page, part_num)
                )

                if evidence:
                    result.update(
                        {
                            "found": True,
                            "status": "source_backed_match",
                            "partName": evidence["partName"],
                            "price": evidence["price"],
                            "url": evidence["url"],
                            "sourceHtmlSnippet": evidence["sourceHtmlSnippet"],
                        }
                    )
                    print(f"FOUND: {part_num} - {evidence['partName']}")
                else:
                    page_title = visible_text(page.locator("h1")) or page.title()
                    result["pageTitle"] = page_title
                    result["resolvedUrl"] = page.url
                    print(f"NOT FOUND: {part_num} - {page_title}")
            except Exception as e:
                print(f"Error searching for {part_num}: {e}")
                result["status"] = "search_error"
                result["error"] = str(e)

            results.append(result)
        
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
            
        browser.close()

if __name__ == "__main__":
    run()
