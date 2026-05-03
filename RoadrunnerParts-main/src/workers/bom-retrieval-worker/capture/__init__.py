import json
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0 Safari/537.36"
)

BLOCKED_STATUS_CODES = {401, 403, 407, 409, 423, 429}
BLOCKED_TEXT_MARKERS = (
    "access denied",
    "are you a robot",
    "captcha",
    "cloudflare",
    "temporarily blocked",
    "too many requests",
    "unusual traffic",
)


class SourceBlockedError(Exception):
    def __init__(
        self,
        message: str,
        *,
        url: str,
        status_code: int | None = None,
        evidence_path: str | None = None,
    ):
        super().__init__(message)
        self.url = url
        self.status_code = status_code
        self.evidence_path = evidence_path
        self.next_action = "manual_evidence_upload_or_retry_later_lower_rate"


def looks_blocked(html: str) -> bool:
    lower = html[:20000].lower()
    return any(marker in lower for marker in BLOCKED_TEXT_MARKERS)


@retry(
    retry=retry_if_not_exception_type(SourceBlockedError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
)
def capture_static_html(url: str, out_path: str) -> str:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    with httpx.Client(timeout=30, follow_redirects=True, headers=headers) as client:
        response = client.get(url)
        html = response.text

        if response.status_code in BLOCKED_STATUS_CODES or looks_blocked(html):
            Path(out_path).write_text(html, encoding="utf-8")
            raise SourceBlockedError(
                f"Source blocked static fetch with status {response.status_code}",
                url=url,
                status_code=response.status_code,
                evidence_path=out_path,
            )

        response.raise_for_status()

    Path(out_path).write_text(html, encoding="utf-8")
    return html


def capture_rendered_html(url: str, out_path: str) -> str:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    network_path = str(Path(out_path).with_suffix(".network.json"))
    network_log = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        page = browser.new_page(
            viewport={"width": 1600, "height": 1200},
            user_agent=USER_AGENT,
        )

        def handle_response(response):
            try:
                request = response.request
                network_log.append(
                    {
                        "url": response.url,
                        "status": response.status,
                        "method": request.method,
                        "resourceType": request.resource_type,
                        "contentType": response.headers.get("content-type", ""),
                    }
                )
            except Exception:
                pass

        page.on("response", handle_response)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_load_state("networkidle", timeout=60000)

        # Ensure we wait for MUI/React hydration
        try:
            page.wait_for_selector("table, [role='row'], main, .MuiGrid-item", timeout=10000)
        except Exception:
            pass

        page.evaluate(
            """
            async () => {
                await new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 500;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 150);
                });
            }
            """
        )

        page.wait_for_timeout(2000)

        html = page.content()
        Path(out_path).write_text(html, encoding="utf-8")
        Path(network_path).write_text(json.dumps(network_log, indent=2), encoding="utf-8")

        if looks_blocked(html):
            browser.close()
            raise SourceBlockedError(
                "Source blocked rendered capture",
                url=url,
                evidence_path=out_path,
            )

        browser.close()

    return html
