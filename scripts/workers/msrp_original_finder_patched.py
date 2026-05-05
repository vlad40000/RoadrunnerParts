#!/usr/bin/env python3
"""
msrp_original_finder.py

Purpose
-------
Find the ORIGINAL MSRP (Manufacturer Suggested Retail Price) for an appliance model,
using a user-supplied target date (e.g., the manufacture date derived from serial decode).

Core principle
--------------
- MSRP must come from MANUFACTURER evidence (manufacturer domain + explicit MSRP/list/suggested text
  OR manufacturer structured data that clearly represents MSRP).
- Retailer prices are NOT MSRP and are ignored by default.

How it works (deterministic)
----------------------------
1) You provide:
   - model number
   - target date (from serial decode), e.g. "2018-06-01"
   - manufacturer domains (e.g., geappliances.com, whirlpool.com)
   - optional: manufacturer product URL(s) for best accuracy
2) Script queries Wayback CDX for snapshots around the target date window.
3) It fetches archived HTML and extracts MSRP candidates only when:
   - explicit MSRP/list/suggested keyword context exists near a price, OR
   - a JSON-LD field strongly suggests MSRP (rare).
4) It chooses the best candidate by:
   - manufacturer domain (required)
   - explicit MSRP keyword proximity
   - snapshot closeness to target date
   - conflict checks

Install
-------
  pip install requests beautifulsoup4 lxml

Examples
--------
Single:
  python msrp_original_finder.py \
    --model "WDT750SAKZ" \
    --target-date "2020-05-15" \
    --mfr-domain "whirlpool.com" \
    --mfr-product-url "https://www.whirlpool.com/kitchen/dishwashers/..."

Batch CSV:
  python msrp_original_finder.py \
    --csv input.csv \
    --mfr-domain "geappliances.com" \
    --out results.csv

CSV format:
  model,target_date,mfr_product_urls
  WDT750SAKZ,2020-05-15,"https://... | https://..."

Notes
-----
- If you do NOT provide --mfr-product-url, the script will attempt Wayback queries using common URL patterns.
  This is best-effort and may miss the true product page. For reliable results, provide the product URL.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, quote_plus

import requests
from bs4 import BeautifulSoup


# -----------------------------
# Config
# -----------------------------

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}

WAYBACK_CDX = "https://web.archive.org/cdx/search/cdx"
WAYBACK_WEB = "https://web.archive.org/web"

DEFAULT_SLEEP_S = 0.5
DEFAULT_TIMEOUT_S = 20

# Strict MSRP cues
MSRP_CUES = [
    r"\bMSRP\b",
    r"\bManufacturer(?:'s)?\s+Suggested\s+Retail\s+Price\b",
    r"\bSuggested\s+Retail\s+Price\b",
    r"\bList\s*Price\b",
]

# Strong exclusions (avoid capturing non-MSRP numbers)
EXCLUDE_CONTEXT = [
    r"\bper\s*month\b",
    r"\b/mo\b",
    r"\bAPR\b",
    r"\bfinanc",
    r"\binstall",
    r"\bdelivery\b",
    r"\brebate\b",
    r"\bsave\b",
    r"\boff\b",
    r"\bdiscount\b",
    r"\bpromo\b",
    r"\bcoupon\b",
    r"\bbundle\b",
    r"\bstarting\s+at\b",
    r"\bas\s+low\s+as\b",
    r"\bfrom\s+\$",
]

CURRENCY_RE = re.compile(r"(?i)\b(USD|CAD|AUD|EUR|GBP)\b")

# Prices with currency/symbols. Captures:
#   optional currency code (USD/CAD/AUD/EUR/GBP)
#   and a numeric amount like 1,299.00
MONEY_WITH_SYMBOL_RE = re.compile(
    r"""(?ix)
    (?:\b(USD|CAD|AUD|EUR|GBP)\b\s*)?
    (?:US\$|CA\$|AU\$|€|£|\$)\s*
    ([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)
    """
)

# Plain numbers like "1,299.00" (ONLY considered very near an MSRP cue window)
PLAIN_PRICE_RE = re.compile(
    r"""(?x)
    (?<!\d)
    ([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)
    (?!\d)
    """
)
# -----------------------------
# Data types
# -----------------------------

@dataclass
class Snapshot:
    timestamp: str      # YYYYMMDDhhmmss
    original_url: str
    archive_url: str

@dataclass
class Candidate:
    msrp: float
    currency: str
    label: str
    manufacturer_domain: str
    original_url: str
    archive_url: str
    timestamp: str
    distance_days: int
    keyword_distance_chars: int
    snippet: str

@dataclass
class Result:
    model: str
    target_date: str
    msrp: Optional[float]
    currency: Optional[str]
    confidence: str
    note: str
    chosen: Optional[Dict[str, Any]]
    considered: List[Dict[str, Any]]


# -----------------------------
# Helpers
# -----------------------------

def _domain(u: str) -> str:
    try:
        return urlparse(u).netloc.lower()
    except Exception:
        return ""

def _is_mfr(domain: str, mfr_domains: List[str]) -> bool:
    d = domain.lower()
    for md in mfr_domains:
        md = (md or "").strip().lower()
        if not md:
            continue
        if d == md or d.endswith("." + md):
            return True
    return False

def _parse_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y-%m-%d").date()

def _timestamp_to_date(ts: str) -> dt.date:
    return dt.datetime.strptime(ts[:8], "%Y%m%d").date()

def _money_to_float(x: str) -> Optional[float]:
    try:
        return float(x.replace(",", ""))
    except Exception:
        return None

def _currency_from_text(txt: str, default: str = "USD") -> str:
    m = CURRENCY_RE.search(txt or "")
    return m.group(1).upper() if m else default


def _clean_space(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()

def _extract_price_matches(window: str) -> List[Tuple[int, str, str]]:
    """
    Extract symbol/currency-prefixed prices from a text window.
    Returns tuples: (pos, currency, amount_str)
    """
    out: List[Tuple[int, str, str]] = []
    for m in MONEY_WITH_SYMBOL_RE.finditer(window or ""):
        cur = (m.group(1) or "").upper()
        if not cur:
            cur = _currency_from_text(window, default="USD")
        amt = m.group(2)
        out.append((m.start(), cur, amt))
    return out

def _extract_plain_prices(window: str) -> List[Tuple[int, str]]:
    """
    Extract plain numeric prices from a text window.
    Returns tuples: (pos, amount_str)
    NOTE: Only use this when already in a strict MSRP cue window and with tight proximity.
    """
    out: List[Tuple[int, str]] = []
    for m in PLAIN_PRICE_RE.finditer(window or ""):
        out.append((m.start(), m.group(1)))
    return out

WAYBACK_SOFT_ERROR_PATTERNS = [
    r"Wayback Machine",
    r"has not been archived",
    r"cannot be displayed due to robots\.txt",
    r"content unavailable",
    r"Sorry\.",  # common Wayback "Sorry" interstitial
]

def _looks_like_wayback_interstitial(html: str) -> bool:
    t = (html or "")[:20000]
    return any(re.search(p, t, flags=re.I) for p in WAYBACK_SOFT_ERROR_PATTERNS)


# -----------------------------
# Wayback
# -----------------------------

RETRY_STATUSES = {429, 500, 502, 503, 504}
RETRY_BACKOFF_S = [1.0, 3.0, 7.0]

def _get_with_retries(url: str, *, params: Optional[Dict[str, Any]] = None) -> requests.Response:
    last_exc: Optional[Exception] = None
    for wait in [0.0] + RETRY_BACKOFF_S:
        if wait:
            time.sleep(wait)
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=DEFAULT_TIMEOUT_S)
            if r.status_code in RETRY_STATUSES:
                last_exc = RuntimeError(f"http_{r.status_code}")
                continue
            r.raise_for_status()
            return r
        except Exception as e:
            last_exc = e
            continue
    raise last_exc or RuntimeError("request_failed")

def wayback_cdx(
    url: str,
    from_yyyymmdd: str,
    to_yyyymmdd: str,
    limit: int = 50,
    sleep_s: float = DEFAULT_SLEEP_S,
) -> List[Snapshot]:
    """
    Query Wayback CDX for snapshots of a given URL in a date range.
    """
    time.sleep(sleep_s)
    params = {
        "url": url,
        "from": from_yyyymmdd,
        "to": to_yyyymmdd,
        "output": "json",
        "fl": "timestamp,original",
        "filter": "statuscode:200",
        "collapse": "digest",
        "limit": str(limit),
    }
    r = _get_with_retries(WAYBACK_CDX, params=params)
    data = r.json()
    if not data or len(data) <= 1:
        return []
    # First row is header
    snaps: List[Snapshot] = []
    for row in data[1:]:
        ts, orig = row[0], row[1]
        snaps.append(Snapshot(timestamp=ts, original_url=orig, archive_url=f"{WAYBACK_WEB}/{ts}id_/{orig}"))
    return snaps

def fetch(url: str, sleep_s: float = DEFAULT_SLEEP_S) -> str:
    time.sleep(sleep_s)
    r = _get_with_retries(url)
    txt = r.text
    if _looks_like_wayback_interstitial(txt):
        raise RuntimeError("wayback_interstitial")
    return txt


# -----------------------------
# Extraction (strict MSRP only)
# -----------------------------

def extract_candidates_from_html(
    html: str,
    *,
    model: str,
    target_date: dt.date,
    snapshot: Snapshot,
    mfr_domain: str,
) -> List[Candidate]:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    text = _clean_space(text)
    if not text:
        return []
    # Quick relevance check: require model number evidence in text OR raw HTML OR URL.
    # (Prevents accidentally grabbing MSRP from an unrelated page on same domain)
    model_upper = (model or "").strip().upper()
    if model_upper:
        text_hit = model_upper in text.upper()
        url_hit = model_upper in (snapshot.original_url or "").upper()
        html_hit = model_upper in (html or "").upper()  # catches JS/attrs/hidden content
        if not (text_hit or url_hit or html_hit):
            return []

    snap_date = _timestamp_to_date(snapshot.timestamp)
    distance_days = abs((snap_date - target_date).days)

    candidates: List[Candidate] = []

    # Search for MSRP cues in text and capture the nearest plausible price near the cue
    haystack = text  # already cleaned
    for cue in MSRP_CUES:
        for m in re.finditer(cue, haystack, flags=re.I):
            # window around cue
            start = max(0, m.start() - 120)
            end = min(len(haystack), m.end() + 300)
            window = haystack[start:end]

            # Find and select a price near the cue.
            cue_pos = m.start() - start

            prices = _extract_price_matches(window)

            # Fallback to plain numeric prices only if no symbol/currency prices were found.
            use_plain = False
            if not prices:
                use_plain = True
                prices_plain = _extract_plain_prices(window)
                # Only consider plain prices that appear shortly AFTER the cue.
                prices_plain = [(pos, amt) for (pos, amt) in prices_plain if 0 <= (pos - cue_pos) <= 120]
                prices = [(pos, _currency_from_text(window, default="USD"), amt) for (pos, amt) in prices_plain]

            if not prices:
                continue

            # Prefer prices AFTER the cue, then allow BEFORE-cue only if very close.
            after = [(pos, cur, amt) for (pos, cur, amt) in prices if pos >= cue_pos]
            before = [(pos, cur, amt) for (pos, cur, amt) in prices if pos < cue_pos]

            def _best(lst: List[Tuple[int, str, str]]) -> Tuple[int, str, str]:
                return min(lst, key=lambda t: abs(t[0] - cue_pos))

            best = None
            if after:
                best = _best(after)
            elif before:
                close_before = [t for t in before if abs(t[0] - cue_pos) <= 60]
                if close_before:
                    best = _best(close_before)

            if not best:
                continue

            pos, currency, amt = best
            best_dist = abs(pos - cue_pos)

            # Global cap so you don't pick up unrelated numbers elsewhere in the window.
            # Plain prices already have a strict after-cue proximity filter above.
            if not use_plain and best_dist > 200:
                continue

            # Exclude windows that look like financing/rebates, etc.
            excluded = any(re.search(bad, window, flags=re.I) for bad in EXCLUDE_CONTEXT)
            if excluded and best_dist > 60:
                continue

            p = _money_to_float(amt)
            if p is None:
                continue

            # Strict filter: MSRP should be a plausible full price (avoid capturing $25 rebates, etc.)
            # You can adjust this floor if needed.
            if p < 100:
                continue

            candidates.append(


                Candidate(
                    msrp=p,
                    currency=currency,
                    label=f"explicit:{m.group(0)}",
                    manufacturer_domain=mfr_domain,
                    original_url=snapshot.original_url,
                    archive_url=snapshot.archive_url,
                    timestamp=snapshot.timestamp,
                    distance_days=distance_days,
                    keyword_distance_chars=best_dist,
                    snippet=window[:500],
                )
            )

    # Optional: JSON-LD parsing (kept conservative: do NOT assume offers.price is MSRP)
    # Only accept if an explicit msrp-like field is present in JSON-LD.
    scripts = soup.find_all("script", attrs={"type": re.compile(r"application/ld\+json", re.I)})
    for sc in scripts:
        raw = (sc.string or sc.get_text() or "").strip()
        if not raw:
            continue
        parsed = None
        try:
            parsed = json.loads(raw)
        except Exception:
            continue

        def walk(node: Any) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if isinstance(node, dict):
                out.append(node)
                for v in node.values():
                    out.extend(walk(v))
            elif isinstance(node, list):
                for it in node:
                    out.extend(walk(it))
            return out

        for obj in walk(parsed):
            if not isinstance(obj, dict):
                continue
            for k in ("msrp", "suggestedRetailPrice", "manufacturerSuggestedRetailPrice", "listPrice"):
                if k in obj:
                    val = str(obj.get(k))
                    pv = _money_to_float(val)
                    if pv is None:
                        continue
                    if pv < 100:
                        continue
                    candidates.append(
                        Candidate(
                            msrp=pv,
                            currency=_currency_from_text(val, default="USD"),
                            label=f"jsonld:{k}",
                            manufacturer_domain=mfr_domain,
                            original_url=snapshot.original_url,
                            archive_url=snapshot.archive_url,
                            timestamp=snapshot.timestamp,
                            distance_days=distance_days,
                            keyword_distance_chars=0,
                            snippet=_clean_space(val)[:200],
                        )
                    )

    # De-dup
    seen = set()
    out: List[Candidate] = []
    for c in candidates:
        key = (round(c.msrp, 2), c.currency, c.label, c.timestamp, c.original_url)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)

    return out


# -----------------------------
# Candidate selection
# -----------------------------

def choose_best(cands: List[Candidate]) -> Tuple[Optional[Candidate], str, str]:
    if not cands:
        return None, "none", "No manufacturer MSRP candidates found in the archive window."

    # Score:
    # - Explicit keyword beats jsonld field (both are good, but explicit wins for audit)
    # - Lower keyword distance wins
    # - Closer to target date wins
    # - Penalize large deviations in keyword distance
    def score(c: Candidate) -> float:
        is_explicit = 1.0 if c.label.startswith("explicit:") else 0.85
        dist_kw = 1.0 / (1.0 + min(c.keyword_distance_chars, 400))
        dist_days = 1.0 / (1.0 + min(c.distance_days, 3650))
        return (2.0 * is_explicit) + (1.5 * dist_kw) + (1.2 * dist_days)

    ranked = sorted(cands, key=score, reverse=True)
    best = ranked[0]

    # Confidence heuristic (deterministic)
    # High if:
    # - explicit cue
    # - and within 365 days of target date
    # - and keyword distance <= 80
    if best.label.startswith("explicit:") and best.distance_days <= 365 and best.keyword_distance_chars <= 80:
        conf = "high"
        note = "Explicit MSRP cue found on manufacturer archive snapshot close to target date."
    elif best.label.startswith("explicit:"):
        conf = "medium"
        note = "Explicit MSRP cue found on manufacturer archive snapshot, but not very close to target date."
    else:
        conf = "medium"
        note = "Manufacturer JSON-LD MSRP-like field found; explicit on-page cue not detected."

    # Conflict check: if there are strong alternative MSRPs near in time
    near = [c for c in ranked[1:10] if c.currency == best.currency and c.distance_days <= best.distance_days + 90]
    conflicting = [c for c in near if abs(c.msrp - best.msrp) >= 50]
    if conflicting:
        conf = "low" if conf == "high" else conf
        note += " Conflicting MSRP-like values exist in nearby snapshots; manual review recommended."

    return best, conf, note


# -----------------------------
# URL discovery (best-effort)
# -----------------------------

def generate_guess_urls(model: str, mfr_domain: str) -> List[str]:
    """
    Best-effort guesses. This is NOT guaranteed.
    For best results, user should pass --mfr-product-url.
    """
    m = model.strip()
    base = f"https://{mfr_domain}"
    guesses = [
        f"{base}/search?query={quote_plus(m)}",
        f"{base}/search?search={quote_plus(m)}",
        f"{base}/search/{quote_plus(m)}",
        f"{base}/products/{quote_plus(m)}",
        f"{base}/product/{quote_plus(m)}",
        f"{base}/p/{quote_plus(m)}",
    ]
    return guesses


# -----------------------------
# Main flow
# -----------------------------

def find_original_msrp_for_model(
    model: str,
    target_date_s: str,
    mfr_domains: List[str],
    mfr_product_urls: List[str],
    window_days_before: int,
    window_days_after: int,
    cdx_limit_per_url: int,
    sleep_s: float,
) -> Result:
    target_date = _parse_date(target_date_s)

    # Date window for CDX
    start = target_date - dt.timedelta(days=window_days_before)
    end = target_date + dt.timedelta(days=window_days_after)
    from_yyyymmdd = start.strftime("%Y%m%d")
    to_yyyymmdd = end.strftime("%Y%m%d")

    all_candidates: List[Candidate] = []
    considered: List[Dict[str, Any]] = []

    # Build URL list per manufacturer domain
    url_seeds: List[Tuple[str, str]] = []  # (mfr_domain, url)
    for md in mfr_domains:
        md = md.strip().lower()
        if not md:
            continue

        # user-provided URLs that belong to this mfr domain
        for u in mfr_product_urls:
            if _is_mfr(_domain(u), [md]):
                url_seeds.append((md, u))

        # if none provided for this domain, add guesses
        if not any(md == d for d, _ in url_seeds):
            for u in generate_guess_urls(model, md):
                url_seeds.append((md, u))

    # For each seed URL, pull snapshots + extract
    for md, seed_url in url_seeds:
        # Only manufacturer domains are allowed for MSRP extraction
        if not _is_mfr(_domain(seed_url), [md]):
            continue

        snaps: List[Snapshot] = []
        try:
            snaps = wayback_cdx(seed_url, from_yyyymmdd, to_yyyymmdd, limit=cdx_limit_per_url, sleep_s=sleep_s)
        except Exception as e:
            considered.append({"seed_url": seed_url, "error": f"cdx_failed:{e}"})
            continue

        if not snaps:
            considered.append({"seed_url": seed_url, "note": "no_snapshots_in_window"})
            continue

        for snap in snaps:
            try:
                html = fetch(snap.archive_url, sleep_s=sleep_s)
            except Exception as e:
                considered.append({"archive_url": snap.archive_url, "error": f"fetch_failed:{e}"})
                continue

            cands = extract_candidates_from_html(
                html,
                model=model,
                target_date=target_date,
                snapshot=snap,
                mfr_domain=md,
            )
            for c in cands:
                all_candidates.append(c)

    best, conf, note = choose_best(all_candidates)

    if best is None:
        return Result(
            model=model,
            target_date=target_date_s,
            msrp=None,
            currency=None,
            confidence="none",
            note=note,
            chosen=None,
            considered=considered + [asdict(c) for c in all_candidates],
        )

    return Result(
        model=model,
        target_date=target_date_s,
        msrp=best.msrp,
        currency=best.currency,
        confidence=conf,
        note=note,
        chosen=asdict(best),
        considered=considered + [asdict(c) for c in all_candidates],
    )


def parse_urls_field(urls_field: str) -> List[str]:
    if not urls_field:
        return []
    parts = re.split(r"\s*\|\s*|\s*,\s*", urls_field.strip())
    return [p for p in parts if p]


def write_csv(path: str, results: List[Result]) -> None:
    fields = [
        "model",
        "target_date",
        "msrp",
        "currency",
        "confidence",
        "note",
        "chosen_archive_url",
        "chosen_original_url",
        "chosen_timestamp",
        "chosen_label",
        "chosen_snippet",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in results:
            ch = r.chosen or {}
            w.writerow(
                {
                    "model": r.model,
                    "target_date": r.target_date,
                    "msrp": r.msrp,
                    "currency": r.currency,
                    "confidence": r.confidence,
                    "note": r.note,
                    "chosen_archive_url": ch.get("archive_url"),
                    "chosen_original_url": ch.get("original_url"),
                    "chosen_timestamp": ch.get("timestamp"),
                    "chosen_label": ch.get("label"),
                    "chosen_snippet": (ch.get("snippet") or "")[:220],
                }
            )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="Appliance model number")
    ap.add_argument("--target-date", help="Target date YYYY-MM-DD (from serial decode manufacture date)")
    ap.add_argument("--mfr-domain", action="append", default=[], help="Manufacturer domain(s), repeatable")
    ap.add_argument("--mfr-product-url", action="append", default=[], help="Manufacturer product URL(s), repeatable")

    ap.add_argument("--window-before-days", type=int, default=365, help="Days before target date to search")
    ap.add_argument("--window-after-days", type=int, default=365, help="Days after target date to search")
    ap.add_argument("--cdx-limit", type=int, default=25, help="Max snapshots per seed URL")
    ap.add_argument("--sleep", type=float, default=DEFAULT_SLEEP_S, help="Delay between requests (seconds)")

    ap.add_argument("--csv", help="Batch CSV with columns: model,target_date,mfr_product_urls (optional)")
    ap.add_argument("--out", help="Output CSV path (batch) OR single-row CSV if used in single mode")
    ap.add_argument("--json", action="store_true", help="Print JSON output to stdout")

    args = ap.parse_args()

    if not args.mfr_domain:
        raise SystemExit("Provide at least one --mfr-domain (e.g., --mfr-domain geappliances.com).")

    if args.csv:
        results: List[Result] = []
        with open(args.csv, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                model = (row.get("model") or "").strip()
                tdate = (row.get("target_date") or "").strip()
                urls_field = (row.get("mfr_product_urls") or "").strip()
                if not model or not tdate:
                    continue
                urls = parse_urls_field(urls_field)
                results.append(
                    find_original_msrp_for_model(
                        model=model,
                        target_date_s=tdate,
                        mfr_domains=args.mfr_domain,
                        mfr_product_urls=(args.mfr_product_url or []) + urls,
                        window_days_before=args.window_before_days,
                        window_days_after=args.window_after_days,
                        cdx_limit_per_url=args.cdx_limit,
                        sleep_s=args.sleep,
                    )
                )

        if args.out:
            write_csv(args.out, results)
            print(f"Wrote: {args.out}")
        else:
            print(json.dumps([asdict(r) for r in results], indent=2))
        return

    if not args.model or not args.target_date:
        raise SystemExit("Single mode requires --model and --target-date (or use --csv).")

    res = find_original_msrp_for_model(
        model=args.model.strip(),
        target_date_s=args.target_date.strip(),
        mfr_domains=args.mfr_domain,
        mfr_product_urls=args.mfr_product_url or [],
        window_days_before=args.window_before_days,
        window_days_after=args.window_after_days,
        cdx_limit_per_url=args.cdx_limit,
        sleep_s=args.sleep,
    )

    if args.json or not args.out:
        print(json.dumps(asdict(res), indent=2))
    else:
        write_csv(args.out, [res])
        print(f"Wrote: {args.out}")


if __name__ == "__main__":
    main()
