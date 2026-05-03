# encompass_scraper.py
# pip install playwright beautifulsoup4 lxml
# python -m playwright install chromium

import json
import re
import tempfile
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

try:
    from fastapi import FastAPI, File, UploadFile
except ImportError:
    FastAPI = None
    File = None
    UploadFile = Any


PREFIX_BY_BRAND = {
    "whirlpool": "WHI",
    "maytag": "WHI",
    "amana": "WHI",
    "kitchenaid": "WHI",
    "hotpoint": "HOT",
    "ge": "GEN",
    "lg": "LGE",
    "samsung": "SAM",
    "frigidaire": "FRI",
    "electrolux": "FRI",
}


def normalize_model(model: str) -> str:
    return re.sub(r"[^A-Z0-9.\-/]", "", model.upper().strip())


def normalize_brand(brand: str) -> str:
    return brand.strip().lower()


def get_encompass_prefix(brand: str) -> str:
    key = normalize_brand(brand)
    if key not in PREFIX_BY_BRAND:
        raise ValueError(f"Unsupported brand for Encompass prefix: {brand}")
    return PREFIX_BY_BRAND[key]


def extract_identity_from_ocr(ocr: dict[str, Any]) -> dict[str, Any]:
    brand = ocr.get("brand")
    model = ocr.get("model")
    serial = ocr.get("serial")

    if not brand:
        raise ValueError("OCR output is missing required field: brand")

    if not model:
        candidates = ocr.get("candidates") or []
        if candidates:
            model = candidates[0]

    if not model:
        raise ValueError("OCR output is missing required field: model")

    normalized_model = normalize_model(model)
    prefix = get_encompass_prefix(brand)

    return {
        "brand": brand,
        "brand_key": normalize_brand(brand),
        "model": normalized_model,
        "serial": serial,
        "product_type": ocr.get("productType"),
        "engineering_code": ocr.get("engineeringCode"),
        "prefix": prefix,
        "confidence": ocr.get("confidence", {}),
        "candidates": ocr.get("candidates", []),
        "decode_result": ocr.get("decodeResult"),
        "raw_ocr": ocr,
    }


def build_encompass_urls(model: str, brand: str):
    model = normalize_model(model)
    prefix = get_encompass_prefix(brand)

    return {
        "model": model,
        "brand": brand,
        "prefix": prefix,
        "regular_url": f"https://partstore.encompass.com/model/{prefix}{model}",
        "regular_url_alt": f"https://encompass.com/model/{prefix}{model}",
        "exploded_guess": f"https://encompass.com/Exploded-View-Assembly/{prefix}/{model}",
    }


def build_encompass_urls_from_identity(identity: dict[str, Any]):
    model = identity["model"]
    brand = identity["brand"]
    prefix = identity["prefix"]

    return {
        "model": model,
        "brand": brand,
        "prefix": prefix,
        "regular_url": f"https://partstore.encompass.com/model/{prefix}{model}",
        "regular_url_alt": f"https://encompass.com/model/{prefix}{model}",
        "exploded_guess": f"https://encompass.com/Exploded-View-Assembly/{prefix}/{model}",
    }


def fetch_html(url: str, wait_for="body") -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page.goto(url, wait_until="networkidle", timeout=60000)
        page.wait_for_selector(wait_for, timeout=30000)
        html = page.content()
        browser.close()
        return html


def extract_internal_exploded_urls(html: str):
    soup = BeautifulSoup(html, "lxml")
    urls = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "Exploded-View" in href or "Exploded-View-Assembly" in href:
            if href.startswith("/"):
                href = "https://encompass.com" + href
            urls.add(href)

    for match in re.findall(r'https?://[^"\']*Exploded-View[^"\']+', html):
        urls.add(match)

    return sorted(urls)


def parse_parts_from_model_page(html: str):
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n", strip=True)

    rows = []

    part_pattern = re.compile(
        r"(?P<part>[A-Z0-9]{3,}[-A-Z0-9]*)\n"
        r"(?P<desc>.*?)(?:\nSchematic Location:\s*(?P<loc>[A-Z0-9\-]+))?"
        r".*?(?P<availability>In Stock|Ships in \d+ days|No)"
        r".*?(?P<price>\d+\.\d{2})?",
        re.S,
    )

    for m in part_pattern.finditer(text):
        part = m.group("part")
        desc = clean_text(m.group("desc"))
        loc = m.group("loc")
        availability = m.group("availability")
        price = m.group("price")

        if not looks_like_part_number(part):
            continue

        rows.append(
            {
                "part_number": part,
                "description": desc,
                "schematic_location": loc,
                "availability": availability,
                "price": float(price) if price else None,
                "source": "encompass_model_page",
            }
        )

    return dedupe_parts(rows)


def clean_text(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(
        r"^(Whirlpool|Maytag|GE|Hotpoint|LG|Samsung|Frigidaire)\s+",
        "",
        value,
        flags=re.I,
    )
    return value[:300]


def looks_like_part_number(value: str) -> bool:
    if len(value) < 4:
        return False
    if value.lower() in {"model", "parts", "price", "stock"}:
        return False
    return bool(re.search(r"\d", value))


def dedupe_parts(rows):
    seen = set()
    out = []

    for row in rows:
        key = (row["part_number"], row.get("schematic_location"))
        if key in seen:
            continue
        seen.add(key)
        out.append(row)

    return out


def scrape_encompass_from_ocr(ocr: dict[str, Any]):
    identity = extract_identity_from_ocr(ocr)
    urls = build_encompass_urls_from_identity(identity)

    html = fetch_html(urls["regular_url"])

    exploded_urls = extract_internal_exploded_urls(html)
    parts = parse_parts_from_model_page(html)

    return {
        "identity": {
            "brand": identity["brand"],
            "model": identity["model"],
            "serial": identity["serial"],
            "product_type": identity["product_type"],
            "engineering_code": identity["engineering_code"],
            "prefix": identity["prefix"],
            "manufacture": identity["decode_result"],
            "ocr_confidence": identity["confidence"],
            "ocr_candidates": identity["candidates"],
        },
        "urls": {
            **urls,
            "exploded_urls_found": exploded_urls,
        },
        "counts": {
            "parts_found": len(parts),
            "exploded_urls_found": len(exploded_urls),
        },
        "parts": parts,
        "source_payload": {
            "ocr": identity["raw_ocr"],
        },
    }


def run_ocr_on_image(image_path: str | Path) -> dict[str, Any]:
    """
    Adapter boundary for the nameplate OCR model.

    This scraper does not read or interpret image pixels directly. Replace this
    function with the app's OCR model call and return the OCR JSON contract.
    """
    raise NotImplementedError(
        "Wire run_ocr_on_image(image_path) to the OCR model before scraping."
    )


def scrape_encompass_from_nameplate_image(image_path: str | Path):
    ocr_output = run_ocr_on_image(image_path)
    return scrape_encompass_from_ocr(ocr_output)


def scrape_encompass_model(model: str, brand: str):
    ocr_like_payload = {
        "brand": brand,
        "model": model,
        "serial": None,
        "productType": None,
        "engineeringCode": None,
        "confidence": {},
        "candidates": [model],
        "decodeResult": None,
    }
    return scrape_encompass_from_ocr(ocr_like_payload)


def load_ocr_json(path: str | Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


if FastAPI is not None:
    app = FastAPI()

    @app.post("/scrape-from-nameplate")
    async def scrape_from_nameplate(file: UploadFile = File(...)):
        suffix = Path(file.filename or "upload").suffix or ".png"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            image_path = tmp.name

        ocr_output = run_ocr_on_image(image_path)
        result = scrape_encompass_from_ocr(ocr_output)

        return result
else:
    app = None


if __name__ == "__main__":
    ocr_output = {
        "brand": "Whirlpool",
        "model": "WTW7500GC2",
        "serial": "C91370070",
        "productType": None,
        "engineeringCode": "589-03",
        "confidence": {
            "brand": 1,
            "productType": 0,
            "modelNumber": 1,
            "serialNumber": 1,
            "engineeringCode": 1,
        },
        "candidates": ["WTW7500GC2"],
        "decodeResult": {
            "brandFamily": "Whirlpool",
            "serial": "C91370070",
            "manufactureYear": 2019,
            "timeValue": {
                "value": 13,
                "unit": "week",
            },
            "confidence": "low",
            "resolutionReason": "Resolved via default (newest) preference",
            "candidatesInitial": [1989, 2019],
            "remainingCandidates": [1989, 2019],
            "rulesApplied": [
                "matched_Whirlpool_9dig",
                "default->newest",
            ],
        },
    }

    result = scrape_encompass_from_ocr(ocr_output)
    print(json.dumps(result, indent=2))
