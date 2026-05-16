from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from typing import Iterable

import requests
from bs4 import BeautifulSoup

try:
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover - optional runtime dependency
    sync_playwright = None

from schemas import (
    CandidateSection,
    CandidateSource,
    DiagramDiscoveryPacket,
    EvidenceQuality,
    EvidenceRef,
    MachineIdentity,
    RetrievalState,
    SerialScopeStatus,
    SourceProvider,
)


SECTION_HINTS = [
    "cabinet",
    "control",
    "console",
    "door",
    "lid",
    "drum",
    "tub",
    "basket",
    "motor",
    "drive",
    "pump",
    "heater",
    "wiring",
    "harness",
    "bulkhead",
    "blower",
    "burner",
    "sealed system",
    "compressor",
    "liner",
    "shelf",
    "optional",
    "installation",
    "small parts",
    "parts diagram",
    "schematic",
    "schematics",
    "assembly",
    "diagram",
    "exploded view",
    "parts list",
]

PROVIDER_HOSTS = {
    "searspartsdirect.com": SourceProvider.SEARS_PARTSDIRECT,
    "reliableparts.com": SourceProvider.RELIABLE_PARTS,
    "encompass.com": SourceProvider.ENCOMPASS,
    "dlpartscolookup.com": SourceProvider.DLPARTS,
    "dlpartsco.com": SourceProvider.DLPARTS,
    "dlparts.com": SourceProvider.DLPARTS,
    "partsdr.com": SourceProvider.PARTSDR,
    "partselect.com": SourceProvider.PARTSELECT,
    "appliancepartspros.com": SourceProvider.APPLIANCE_PARTS_PROS,
    "repairclinic.com": SourceProvider.REPAIRCLINIC,
    "fix.com": SourceProvider.FIX,
}

INTERACTIVE_LOOKUP_HOSTS = [
    "dlpartscolookup.com",
]


def normalize_model(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def provider_from_url(url: str) -> SourceProvider | str:
    lowered = url.lower()
    for host, provider in PROVIDER_HOSTS.items():
        if host in lowered:
            return provider
    return SourceProvider.OTHER


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def is_interactive_lookup_url(url: str) -> bool:
    lowered = url.lower()
    return any(host in lowered for host in INTERACTIVE_LOOKUP_HOSTS)


def fetch_with_requests(url: str, timeout: int = 20) -> tuple[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.url, response.text


def try_submit_model_lookup(page, model: str) -> list[str]:
    """Best-effort generic model lookup driver for sites with a model input.

    This is intentionally conservative: it tries common text/search inputs, fills
    the model, then clicks a lookup/search/submit button or presses Enter.
    Site-specific adapters should replace this once selectors are confirmed.
    """
    actions: list[str] = []
    selectors = [
        "input[name*='model' i]",
        "input[id*='model' i]",
        "input[placeholder*='model' i]",
        "input[type='search']",
        "input[type='text']",
        "input:not([type])",
    ]

    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() <= 0:
                continue
            locator.fill(model, timeout=3000)
            actions.append(f"filled:{selector}")
            break
        except Exception:
            continue

    if not actions:
        return actions

    button_selectors = [
        "button:has-text('Lookup')",
        "button:has-text('Look Up')",
        "button:has-text('Search')",
        "button:has-text('Submit')",
        "input[type='submit']",
        "button[type='submit']",
    ]

    clicked = False
    for selector in button_selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() <= 0:
                continue
            locator.click(timeout=5000)
            actions.append(f"clicked:{selector}")
            clicked = True
            break
        except Exception:
            continue

    if not clicked:
        try:
            page.keyboard.press("Enter")
            actions.append("pressed:Enter")
        except Exception:
            pass

    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        try:
            page.wait_for_timeout(5000)
        except Exception:
            pass

    return actions


def fetch_with_playwright(url: str, model: str | None = None, timeout_ms: int = 30000) -> tuple[str, str, str, list[str]]:
    if sync_playwright is None:
        raise RuntimeError("playwright is not installed")

    actions: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/124 Safari/537.36"
            )
        )
        page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        if model and is_interactive_lookup_url(url):
            actions.extend(try_submit_model_lookup(page, normalize_model(model)))
        title = page.title()
        html = page.content()
        final_url = page.url
        browser.close()
        return final_url, title, html, actions


def should_use_playwright(url: str, html: str) -> bool:
    text = html.lower()
    if is_interactive_lookup_url(url):
        return True
    if len(html) < 1500:
        return True
    return any(
        marker in text
        for marker in [
            "enable javascript",
            "__next_data__",
            "window.__apollo_state__",
            "checking your browser",
            "cf-browser-verification",
        ]
    )


def extract_candidate_links(base_url: str, html: str, model: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[dict] = []
    normalized_model = normalize_model(model)

    for anchor in soup.find_all("a"):
        href = anchor.get("href")
        label = clean_text(anchor.get_text(" "))
        if not href:
            continue
        try:
            url = requests.compat.urljoin(base_url, href)
        except Exception:
            continue

        combined = f"{label} {url}".lower()
        normalized_combined = normalize_model(combined)
        hint_match = any(hint in combined for hint in SECTION_HINTS)
        model_match = normalized_model in normalized_combined if normalized_model else False
        if not hint_match and not model_match:
            continue

        links.append({"label": label or url, "url": url, "hint_match": hint_match, "model_match": model_match})

    unique: dict[str, dict] = {}
    for link in links:
        unique.setdefault(link["url"], link)
    return list(unique.values())[:200]


def extract_structured_section_candidates(base_url: str, html: str, model: str) -> list[dict]:
    """Fallback parser for lookup-result pages where diagrams appear as cards/tables."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []
    normalized_model = normalize_model(model)

    candidate_nodes = soup.find_all(["tr", "li", "article", "section", "div"])
    for node in candidate_nodes:
        text = clean_text(node.get_text(" "))
        if not text or len(text) > 800:
            continue
        lower = text.lower()
        has_hint = any(hint in lower for hint in SECTION_HINTS)
        has_model = normalized_model and normalized_model in normalize_model(text)
        if not has_hint and not has_model:
            continue

        href = None
        anchor = node.find("a", href=True)
        if anchor:
            href = requests.compat.urljoin(base_url, anchor.get("href"))

        label = text[:160]
        results.append({
            "label": label,
            "url": href or base_url,
            "hint_match": has_hint,
            "model_match": bool(has_model),
            "structured": True,
        })

    unique: dict[str, dict] = {}
    for result in results:
        key = f"{result.get('url')}|{result.get('label')}"
        unique.setdefault(key, result)
    return list(unique.values())[:100]


def section_name_from_link(label: str, url: str) -> str:
    label = clean_text(label)
    if label and len(label) <= 120:
        return label
    path = requests.utils.urlparse(url).path
    slug = path.rstrip("/").split("/")[-1]
    return clean_text(slug.replace("-", " ").replace("_", " ")) or "Assembly Section"


def confidence_for_section(link: dict, model: str) -> float:
    confidence = 0.35
    label = str(link.get("label") or "").lower()
    url = str(link.get("url") or "").lower()
    combined = f"{label} {url}"
    if link.get("structured"):
        confidence += 0.1
    if link.get("hint_match"):
        confidence += 0.25
    if link.get("model_match"):
        confidence += 0.2
    if any(word in combined for word in ["diagram", "schematic", "assembly", "parts", "exploded"]):
        confidence += 0.1
    if normalize_model(model) and normalize_model(model) in normalize_model(combined):
        confidence += 0.1
    return min(confidence, 0.98)


def discover_from_url(
    *,
    model: str,
    serial: str | None,
    manufacturer: str | None,
    appliance_type: str | None,
    url: str,
    use_playwright: bool,
) -> DiagramDiscoveryPacket:
    final_url = url
    page_title = None
    html = ""
    fetch_error = None
    playwright_actions: list[str] = []

    try:
        final_url, html = fetch_with_requests(url)
        if use_playwright or should_use_playwright(final_url, html):
            try:
                final_url, page_title, html, playwright_actions = fetch_with_playwright(final_url, model=model)
            except Exception as err:
                fetch_error = f"playwright_failed: {err}"
    except Exception as err:
        fetch_error = f"requests_failed: {err}"
        if use_playwright or is_interactive_lookup_url(url):
            try:
                final_url, page_title, html, playwright_actions = fetch_with_playwright(url, model=model)
                fetch_error = None
            except Exception as pw_err:
                fetch_error = f"requests_failed: {err}; playwright_failed: {pw_err}"

    provider = provider_from_url(final_url)
    evidence = EvidenceRef(
        source=provider,
        url=final_url,
        captured_at=datetime.utcnow(),
        text_hash=hash_text(html) if html else None,
        notes="; ".join([value for value in [fetch_error, f"playwright_actions={playwright_actions}" if playwright_actions else None] if value]),
        quality=EvidenceQuality.MEDIUM if html else EvidenceQuality.NONE,
    )

    identity = MachineIdentity(
        manufacturer=manufacturer,
        appliance_type=appliance_type,
        model_number=model,
        normalized_model=normalize_model(model),
        serial_number=serial,
        serial_scope_status=SerialScopeStatus.MODEL_LEVEL_ONLY if not serial else SerialScopeStatus.UNKNOWN,
        confidence=0.6 if html else 0.2,
        evidence=[evidence],
    )

    links = extract_candidate_links(final_url, html, model) if html else []
    structured = extract_structured_section_candidates(final_url, html, model) if html else []
    merged: dict[str, dict] = {}
    for item in [*links, *structured]:
        key = f"{item.get('url')}|{item.get('label')}"
        merged.setdefault(key, item)
    candidates = list(merged.values())

    candidate_source = CandidateSource(
        provider=provider,
        model_url=final_url,
        title=page_title,
        model_match=normalize_model(model) in normalize_model(html + final_url) if html else False,
        serial_match=None,
        confidence=0.75 if html and normalize_model(model) in normalize_model(html + final_url) else 0.45,
        evidence=[evidence],
        reason_flags=[value for value in [fetch_error, "interactive_lookup_driven" if playwright_actions else None] if value],
    )

    sections: list[CandidateSection] = []
    for index, link in enumerate(candidates, start=1):
        section_name = section_name_from_link(link["label"], link["url"])
        confidence = confidence_for_section(link, model)
        sections.append(
            CandidateSection(
                section_id=f"candidate-{index}",
                section_name=section_name,
                section_sequence=index,
                provider=provider,
                section_url=link["url"],
                diagram_url=link["url"] if any(k in link["url"].lower() for k in ["diagram", "schematic", "assembly", "lookup"]) else None,
                expected_part_count=None,
                confidence=confidence,
                evidence=[evidence],
                reason_flags=[] if confidence >= 0.92 else ["human_section_selection_required"],
            )
        )

    state = RetrievalState.DIAGRAM_CANDIDATES_FOUND if sections else RetrievalState.HITL_REVIEW_REQUIRED
    return DiagramDiscoveryPacket(
        identity=identity,
        candidate_sources=[candidate_source],
        candidate_sections=sections,
        expected_total_part_count=None,
        expected_count_source=None,
        retrieval_state=state,
        failure_reason=fetch_error if not sections else None,
        recommended_action="Review candidate sections and approve the correct diagram sections."
        if sections
        else "Enter a provider model URL or request Playwright capture for a known parts page.",
    )


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Discover appliance BOM diagram sections for HITL review.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--serial")
    parser.add_argument("--manufacturer")
    parser.add_argument("--appliance-type")
    parser.add_argument("--url", required=True, help="Provider model/parts URL to inspect")
    parser.add_argument("--playwright", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)

    packet = discover_from_url(
        model=args.model,
        serial=args.serial,
        manufacturer=args.manufacturer,
        appliance_type=args.appliance_type,
        url=args.url,
        use_playwright=args.playwright,
    )
    print(packet.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
