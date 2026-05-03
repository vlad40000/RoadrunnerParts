import re
from decimal import Decimal
from typing import Any

from bs4 import BeautifulSoup


PRICE_RE = re.compile(r"\$?\s*(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)")


def text_of(node) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def parse_price(text: str) -> Decimal | None:
    normalized = text.strip()
    if not normalized or "CALL" in normalized.upper():
        return None
    match = PRICE_RE.search(normalized)
    if not match:
        return None
    return Decimal(match.group(1).replace(",", ""))


def infer_section(table, soup: BeautifulSoup) -> str:
    previous = table.find_previous(["h1", "h2", "h3", "h4", "caption"])
    if previous:
        section = text_of(previous)
        if section:
            return section
    active_tab = soup.select_one(".active, .selected, [aria-selected='true']")
    section = text_of(active_tab)
    return section or "General"


def parse_encompass_html(
    html: str,
    source_url: str,
    model: str,
    brand: str | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    soup = BeautifulSoup(html, "lxml")
    parts: list[dict[str, Any]] = []
    prices: list[dict[str, Any]] = []

    for table in soup.find_all("table"):
        section = infer_section(table, soup)
        headers = [text_of(header).lower() for header in table.find_all("th")]

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            cell_text = [text_of(cell) for cell in cells]
            joined = " ".join(cell_text).lower()
            if "part number" in joined and "description" in joined:
                continue

            diagram = cell_text[0] if cell_text else None
            part_number = None
            description = None
            price_text = ""

            if headers:
                mapped = {headers[index]: cell_text[index] for index in range(min(len(headers), len(cell_text)))}
                part_number = (
                    mapped.get("part #")
                    or mapped.get("part number")
                    or mapped.get("part")
                    or mapped.get("sku")
                )
                description = mapped.get("description") or mapped.get("part description")
                price_text = mapped.get("price") or mapped.get("retail price") or mapped.get("your price") or ""
            else:
                part_number = cell_text[1] if len(cell_text) > 1 else cell_text[0]
                description = cell_text[2] if len(cell_text) > 2 else ""
                price_text = " ".join(cell_text[3:])

            if not part_number or not re.search(r"[A-Za-z0-9]", part_number):
                continue
            if part_number.lower() in ("part", "part #", "part number"):
                continue

            nla_text = joined
            nla_status = any(token in nla_text for token in ("discontinued", "nla", "no longer", "unavailable"))
            replacement_note = None
            if "replaces" in nla_text or "substitutes" in nla_text:
                replacement_note = " ".join(cell_text)

            part_row = {
                "provider": "encompass",
                "model": model,
                "brand": brand,
                "section": section,
                "diagram_number": diagram or None,
                "original_part_number": part_number.strip(),
                "current_service_part_number": part_number.strip(),
                "description": description or part_number.strip(),
                "nla_status": nla_status,
                "replacement_note": replacement_note,
                "source_url": source_url,
                "source_type": "distributor",
            }
            parts.append(part_row)

            price = parse_price(price_text)
            prices.append(
                {
                    "part_number": part_number.strip(),
                    "normalized_model": model,
                    "primary_source": "encompass",
                    "listed_price": price,
                    "currency": "USD",
                    "availability": None,
                    "product_url": source_url,
                    "product_title": description or part_number.strip(),
                    "match_type": "exact_part",
                    "price_status": "verified_price" if price else "exact_part_found_no_price",
                    "raw": {"price_text": price_text, "row_text": cell_text},
                }
            )

    return parts, prices
