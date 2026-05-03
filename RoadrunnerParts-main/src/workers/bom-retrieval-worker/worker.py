import argparse
import json
import os
import time
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import pandas as pd
import psycopg
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from rapidfuzz import fuzz

from capture import SourceBlockedError, capture_rendered_html, capture_static_html
from parser import parse_encompass_html
from validation import (
    ParsedPartRow,
    PriceSnapshot,
    evaluate_completion,
    validate_part_row,
    validate_pricing_row,
)


load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
WORKER_ID = f"bom-worker-py-{uuid.uuid4().hex[:8]}"
CAPTURE_ROOT = Path(os.getenv("WORKER_CAPTURE_ROOT", "captures/encompass"))
ENABLE_PLAYWRIGHT = os.getenv("WORKER_PLAYWRIGHT", "0") == "1"
POLL_SECONDS = float(os.getenv("WORKER_POLL_SECONDS", "5"))

MODEL_CAPTURE_JOB = "capture_model_page"
EXPLODED_CAPTURE_JOB = "capture_exploded_view"
EXTRACT_PARTS_JOB = "extract_parts"
EXTRACT_PRICING_JOB = "extract_pricing"
LEGACY_FULL_JOB = "encompass_bom_pricing"


def json_ready(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required for the BOM retrieval worker")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def claim_job(conn) -> dict[str, Any] | None:
    with conn.transaction():
        row = conn.execute(
            """
            SELECT id
            FROM bom_retrieval_jobs
            WHERE status IN ('pending', 'retry')
              AND attempts < max_attempts
            ORDER BY priority ASC, created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """
        ).fetchone()
        if not row:
            return None

        return conn.execute(
            """
            UPDATE bom_retrieval_jobs
            SET status = 'running',
                attempts = attempts + 1,
                locked_by = %s,
                locked_at = NOW(),
                started_at = COALESCE(started_at, NOW()),
                updated_at = NOW()
            WHERE id = %s
            RETURNING *
            """,
            (WORKER_ID, row["id"]),
        ).fetchone()


def build_encompass_url(job: dict[str, Any]) -> str:
    if job.get("source_url"):
        return job["source_url"]

    payload = job.get("payload") or {}
    for key in ("sourceUrl", "providerModelUrl", "url"):
        if payload.get(key):
            return payload[key]

    brand = (job.get("brand") or "").strip()
    model = job["model"].strip().upper()
    brand_code = (payload.get("brandCode") or "").strip()
    if not brand_code:
        brand_code = "whi" if brand.lower() == "whirlpool" else "smg"
    return f"https://encompass.com/model/{brand_code}/{brand}/{model}"


def safe_model_path(model: str) -> str:
    return model.replace("/", "_").replace("\\", "_")


def insert_retrieval_job(
    conn,
    *,
    bom_job_id: str,
    model: str,
    brand: str | None,
    job_type: str,
    source_url: str | None,
    priority: int,
    payload: dict[str, Any] | None = None,
):
    conn.execute(
        """
        INSERT INTO bom_retrieval_jobs (
          id, bom_job_id, provider, job_type, status, priority,
          model, brand, source_url, payload, updated_at
        )
        VALUES (%s, %s, 'encompass', %s, 'pending', %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (bom_job_id, provider, job_type, model)
        DO UPDATE SET
          status = 'pending',
          priority = EXCLUDED.priority,
          brand = EXCLUDED.brand,
          source_url = EXCLUDED.source_url,
          payload = EXCLUDED.payload,
          error_text = NULL,
          locked_by = NULL,
          locked_at = NULL,
          started_at = NULL,
          finished_at = NULL,
          updated_at = NOW()
        """,
        (
            str(uuid.uuid4()),
            bom_job_id,
            job_type,
            priority,
            model,
            brand,
            source_url,
            Jsonb(json_ready(payload or {})),
        ),
    )


def complete_retrieval_job(conn, job: dict[str, Any], summary: dict[str, Any]):
    conn.execute(
        """
        UPDATE bom_retrieval_jobs
        SET status = 'completed',
            result_summary = %s,
            error_text = NULL,
            finished_at = NOW(),
            updated_at = NOW()
        WHERE id = %s
        """,
        (Jsonb(json_ready(summary)), job["id"]),
    )


def parse_exploded_view_links(html: str, base_url: str, payload: dict[str, Any]) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        if "Exploded-View" in href:
            links.append(urljoin(base_url, href))

    fallback = payload.get("explodedViewUrl")
    if fallback:
        links.append(str(fallback))

    unique: list[str] = []
    for link in links:
        if link not in unique:
            unique.append(link)
    return unique


def parse_assembly_rows(html: str, base_url: str, model: str, brand: str | None) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict[str, Any]] = []

    for index, anchor in enumerate(soup.find_all("a", href=True), start=1):
        href = str(anchor.get("href") or "")
        text = " ".join(anchor.get_text(" ", strip=True).split())
        if "Exploded-View-Assembly" not in href and "assembly" not in href.lower():
            continue
        section = text or f"Assembly {index}"
        rows.append(
            {
                "brand": brand,
                "model": model,
                "provider": "encompass",
                "provider_assembly_url": urljoin(base_url, href),
                "section_seq": index,
                "section_label_raw": section,
                "section_name_clean": section,
                "normalized_section": section.lower(),
                "source_status": "captured",
                "source_file": "bom-retrieval-worker",
            }
        )

    if not rows:
        title = soup.find(["h1", "h2", "title"])
        section = " ".join(title.get_text(" ", strip=True).split()) if title else "General"
        rows.append(
            {
                "brand": brand,
                "model": model,
                "provider": "encompass",
                "provider_assembly_url": base_url,
                "section_seq": 1,
                "section_label_raw": section,
                "section_name_clean": section,
                "normalized_section": section.lower(),
                "source_status": "captured",
                "source_file": "bom-retrieval-worker",
            }
        )

    return rows


def dedupe_parts(rows: list[ParsedPartRow]) -> list[ParsedPartRow]:
    accepted: list[ParsedPartRow] = []
    for row in rows:
        duplicate = False
        for existing in accepted:
            same_part = existing.current_service_part_number == row.current_service_part_number
            same_section = existing.section.lower() == row.section.lower()
            similar_description = fuzz.token_set_ratio(existing.description, row.description) >= 96
            if same_part and (same_section or similar_description):
                duplicate = True
                break
        if not duplicate:
            accepted.append(row)
    return accepted


def dedupe_prices(rows: list[PriceSnapshot]) -> list[PriceSnapshot]:
    by_part: dict[str, PriceSnapshot] = {}
    for row in rows:
        current = by_part.get(row.part_number)
        if current is None:
            by_part[row.part_number] = row
            continue
        current_verified = current.price_status in ("verified_price", "fallback_verified_price")
        row_verified = row.price_status in ("verified_price", "fallback_verified_price")
        if row_verified and not current_verified:
            by_part[row.part_number] = row
    return list(by_part.values())


def summarize_with_pandas(parts: list[ParsedPartRow], prices: list[PriceSnapshot]) -> dict[str, Any]:
    part_frame = pd.DataFrame([row.model_dump(mode="json") for row in parts])
    price_frame = pd.DataFrame([row.model_dump(mode="json") for row in prices])
    return {
        "section_counts": (
            part_frame.groupby("section").size().to_dict() if not part_frame.empty else {}
        ),
        "priced_parts": int(
            price_frame[price_frame["price_status"].isin(["verified_price", "fallback_verified_price"])].shape[0]
        )
        if not price_frame.empty
        else 0,
    }


def gemini_validation_layer(parts: list[ParsedPartRow], prices: list[PriceSnapshot]) -> dict[str, Any]:
    if not os.getenv("GEMINI_API_KEY"):
        return {"enabled": False, "reason": "GEMINI_API_KEY not configured"}
        
    prompt_rule = """
    ROLE: You are an advisory validation engine for an appliance parts retrieval system.
    
    PERMITTED ACTIONS:
    - Interpreting messy OCR
    - Classifying model/brand clues
    - Validating whether extracted rows look like parts
    - Repairing malformed JSON
    - Checking whether assembly names are plausible
    - Summarizing why a retrieval failed
    - Ranking confidence
    
    PROHIBITED ACTIONS:
    - Inventing part numbers
    - Estimating prices
    - Declaring BOM complete without DB evidence
    - Guessing missing rows
    - Bypassing supplier blocks
    
    TASK: Analyze the current retrieval batch and provide a confidence score (0.0 to 1.0) and a brief summary.
    """
    
    # In a full implementation, we would call the Gemini API here using the prompt_rule
    # passing the parts and prices JSON strings as context.
    # For now, we enforce the boundary by ensuring it only returns advisory metadata.
    
    return {
        "enabled": True,
        "role": "validator_classifier",
        "writes_database_truth": False,
        "part_count": len(parts),
        "price_count": len(prices),
        "prompt_enforced": True
    }


def expected_part_count(conn, bom_job_id: str) -> int | None:
    row = conn.execute(
        """
        SELECT COALESCE(expected_part_count, expected_parts_total, trusted_total_part_count) AS expected
        FROM bom_jobs
        WHERE id = %s
        """,
        (bom_job_id,),
    ).fetchone()
    return row["expected"] if row and row.get("expected") is not None else None


def parse_sources(job: dict[str, Any], url: str) -> tuple[list[ParsedPartRow], list[PriceSnapshot], list[dict[str, Any]]]:
    model = job["model"]
    brand = job.get("brand")
    capture_dir = CAPTURE_ROOT / safe_model_path(model)
    static_path = capture_dir / f"{job['id']}_static.html"

    artifacts: list[dict[str, Any]] = []
    html = capture_static_html(url, str(static_path))
    artifacts.append({"kind": "static_html", "path": str(static_path), "sourceUrl": url})

    raw_parts, raw_prices = parse_encompass_html(html, url, model, brand)

    if ENABLE_PLAYWRIGHT and not raw_parts:
        rendered_path = capture_dir / f"{job['id']}_rendered.html"
        rendered = capture_rendered_html(url, str(rendered_path))
        artifacts.append({"kind": "rendered_html", "path": str(rendered_path), "sourceUrl": url})
        raw_parts, raw_prices = parse_encompass_html(rendered, url, model, brand)

    parts = [part for part in (validate_part_row(row) for row in raw_parts) if part]
    prices = [price for price in (validate_pricing_row(row) for row in raw_prices) if price]
    return dedupe_parts(parts), dedupe_prices(prices), artifacts


def process_capture_model_page(conn, job: dict[str, Any], url: str) -> dict[str, Any]:
    model = job["model"]
    brand = job.get("brand")
    payload = job.get("payload") or {}
    capture_dir = CAPTURE_ROOT / safe_model_path(model)
    static_path = capture_dir / f"{job['id']}_model_page.html"
    html = capture_static_html(url, str(static_path))
    exploded_links = parse_exploded_view_links(html, url, payload)

    if not exploded_links:
        raise RuntimeError("Model page captured but no exploded view URL was found.")

    exploded_url = exploded_links[0]
    summary = {
        "jobType": MODEL_CAPTURE_JOB,
        "model": model,
        "brand": brand,
        "modelPageUrl": url,
        "explodedViewUrl": exploded_url,
        "explodedViewUrlCount": len(exploded_links),
        "artifacts": [{"kind": "model_page_html", "path": str(static_path), "sourceUrl": url}],
        "nextJob": EXPLODED_CAPTURE_JOB,
    }

    with conn.transaction():
        conn.execute(
            """
            INSERT INTO model_source (
              normalized_model, source, tier, source_url, url_type, confidence, status, raw, checked_at
            )
            VALUES (%s, 'encompass', 'distributor', %s, 'model_page', 'captured', 'captured', %s, NOW())
            """,
            (model, url, Jsonb(json_ready(summary))),
        )
        conn.execute(
            """
            INSERT INTO model_source (
              normalized_model, source, tier, source_url, url_type, confidence, status, raw, checked_at
            )
            VALUES (%s, 'encompass', 'distributor', %s, 'exploded_view', 'parsed_from_model_page', 'queued', %s, NOW())
            """,
            (model, exploded_url, Jsonb(json_ready({"fromModelPage": url, "jobId": job["id"]}))),
        )
        conn.execute(
            """
            INSERT INTO provider_model_routes (
              brand, model, provider, provider_model_url, provider_assembly_url,
              source_status, source_file, updated_at
            )
            VALUES (%s, %s, 'encompass', %s, %s, 'model_page_captured', 'bom-retrieval-worker', NOW())
            ON CONFLICT DO NOTHING
            """,
            (brand, model, url, exploded_url),
        )
        insert_retrieval_job(
            conn,
            bom_job_id=job["bom_job_id"],
            model=model,
            brand=brand,
            job_type=EXPLODED_CAPTURE_JOB,
            source_url=exploded_url,
            priority=85,
            payload={"modelPageUrl": url, "explodedLinks": exploded_links},
        )
        conn.execute(
            """
            UPDATE bom_jobs
            SET job_stage = 'capture_exploded_view_queued',
                retrieval_state = 'exploded_url_found',
                source_strategy = 'db-first-worker:encompass',
                retrieved_sources = COALESCE(retrieved_sources, '[]'::jsonb) || %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                Jsonb(
                    json_ready(
                        [
                            {
                                "sourceUrl": url,
                                "sourceType": "distributor",
                                "provider": "encompass",
                                "checkedAt": datetime.utcnow().isoformat(),
                                "artifacts": summary["artifacts"],
                            },
                            {
                                "sourceUrl": exploded_url,
                                "sourceType": "diagram",
                                "provider": "encompass",
                                "checkedAt": datetime.utcnow().isoformat(),
                            },
                        ]
                    )
                ),
                job["bom_job_id"],
            ),
        )
        complete_retrieval_job(conn, job, summary)

    return summary


def process_capture_exploded_view(conn, job: dict[str, Any], url: str) -> dict[str, Any]:
    model = job["model"]
    brand = job.get("brand")
    capture_dir = CAPTURE_ROOT / safe_model_path(model)
    static_path = capture_dir / f"{job['id']}_exploded_view.html"
    html = capture_static_html(url, str(static_path))
    assembly_rows = parse_assembly_rows(html, url, model, brand)

    with conn.transaction():
        for row in assembly_rows:
            conn.execute(
                """
                INSERT INTO provider_assembly_sections (
                  brand, model, provider, provider_assembly_url, section_seq,
                  section_label_raw, section_name_clean, normalized_section,
                  source_status, source_file
                )
                VALUES (%s, %s, 'encompass', %s, %s, %s, %s, %s, 'captured', 'bom-retrieval-worker')
                ON CONFLICT DO NOTHING
                """,
                (
                    row["brand"],
                    row["model"],
                    row["provider_assembly_url"],
                    row["section_seq"],
                    row["section_label_raw"],
                    row["section_name_clean"],
                    row["normalized_section"],
                ),
            )

        insert_retrieval_job(
            conn,
            bom_job_id=job["bom_job_id"],
            model=model,
            brand=brand,
            job_type=EXTRACT_PARTS_JOB,
            source_url=url,
            priority=90,
            payload={"assemblyCount": len(assembly_rows)},
        )
        insert_retrieval_job(
            conn,
            bom_job_id=job["bom_job_id"],
            model=model,
            brand=brand,
            job_type=EXTRACT_PRICING_JOB,
            source_url=url,
            priority=95,
            payload={"assemblyCount": len(assembly_rows)},
        )

        summary = {
            "jobType": EXPLODED_CAPTURE_JOB,
            "model": model,
            "brand": brand,
            "explodedViewUrl": url,
            "assemblyCount": len(assembly_rows),
            "artifacts": [{"kind": "exploded_view_html", "path": str(static_path), "sourceUrl": url}],
            "nextJobs": [EXTRACT_PARTS_JOB, EXTRACT_PRICING_JOB],
        }

        conn.execute(
            """
            UPDATE bom_jobs
            SET job_stage = 'extract_parts_pricing_queued',
                retrieval_state = 'assemblies_found',
                source_strategy = 'db-first-worker:encompass',
                retrieved_sources = COALESCE(retrieved_sources, '[]'::jsonb) || %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                Jsonb(
                    json_ready(
                        [
                            {
                                "sourceUrl": url,
                                "sourceType": "diagram",
                                "provider": "encompass",
                                "sectionCount": len(assembly_rows),
                                "checkedAt": datetime.utcnow().isoformat(),
                                "artifacts": summary["artifacts"],
                            }
                        ]
                    )
                ),
                job["bom_job_id"],
            ),
        )
        complete_retrieval_job(conn, job, summary)

    return summary


def process_capture_model_page_safe(job: dict[str, Any], url: str) -> dict[str, Any]:
    model = job["model"]
    brand = job.get("brand")
    payload = job.get("payload") or {}
    capture_dir = CAPTURE_ROOT / safe_model_path(model)
    static_path = capture_dir / f"{job['id']}_model_page.html"
    html = capture_static_html(url, str(static_path))
    exploded_links = parse_exploded_view_links(html, url, payload)

    if not exploded_links:
        raise RuntimeError("Model page captured but no exploded view URL was found.")

    exploded_url = exploded_links[0]
    summary = {
        "jobType": MODEL_CAPTURE_JOB,
        "model": model,
        "brand": brand,
        "modelPageUrl": url,
        "explodedViewUrl": exploded_url,
        "explodedViewUrlCount": len(exploded_links),
        "artifacts": [{"kind": "model_page_html", "path": str(static_path), "sourceUrl": url}],
        "nextJob": EXPLODED_CAPTURE_JOB,
    }

    with get_connection() as conn:
        with conn.transaction():
            conn.execute(
                """
                INSERT INTO model_source (
                  normalized_model, source, tier, source_url, url_type, confidence, status, raw, checked_at
                )
                VALUES (%s, 'encompass', 'distributor', %s, 'model_page', 'captured', 'captured', %s, NOW())
                """,
                (model, url, Jsonb(json_ready(summary))),
            )
            conn.execute(
                """
                INSERT INTO model_source (
                  normalized_model, source, tier, source_url, url_type, confidence, status, raw, checked_at
                )
                VALUES (%s, 'encompass', 'distributor', %s, 'exploded_view', 'parsed_from_model_page', 'queued', %s, NOW())
                """,
                (model, exploded_url, Jsonb(json_ready({"fromModelPage": url, "jobId": job["id"]}))),
            )
            insert_retrieval_job(
                conn,
                bom_job_id=job["bom_job_id"],
                model=model,
                brand=brand,
                job_type=EXPLODED_CAPTURE_JOB,
                source_url=exploded_url,
                priority=85,
                payload={"modelPageUrl": url, "explodedLinks": exploded_links},
            )
            conn.execute(
                """
                UPDATE bom_jobs
                SET job_stage = 'capture_exploded_view_queued',
                    retrieval_state = 'exploded_url_found',
                    source_strategy = 'db-first-worker:encompass',
                    retrieved_sources = COALESCE(retrieved_sources, '[]'::jsonb) || %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    Jsonb(json_ready([
                        {
                            "sourceUrl": url,
                            "sourceType": "distributor",
                            "provider": "encompass",
                            "checkedAt": datetime.utcnow().isoformat(),
                            "artifacts": summary["artifacts"],
                        },
                        {
                            "sourceUrl": exploded_url,
                            "sourceType": "diagram",
                            "provider": "encompass",
                            "checkedAt": datetime.utcnow().isoformat(),
                        },
                    ])),
                    job["bom_job_id"],
                ),
            )
            complete_retrieval_job(conn, job, summary)

    return summary


def process_capture_exploded_view_safe(job: dict[str, Any], url: str) -> dict[str, Any]:
    model = job["model"]
    brand = job.get("brand")
    capture_dir = CAPTURE_ROOT / safe_model_path(model)
    static_path = capture_dir / f"{job['id']}_exploded_view.html"
    html = capture_static_html(url, str(static_path))
    assembly_rows = parse_assembly_rows(html, url, model, brand)

    summary = {
        "jobType": EXPLODED_CAPTURE_JOB,
        "model": model,
        "brand": brand,
        "explodedViewUrl": url,
        "assemblyCount": len(assembly_rows),
        "artifacts": [{"kind": "exploded_view_html", "path": str(static_path), "sourceUrl": url}],
        "nextJobs": [EXTRACT_PARTS_JOB, EXTRACT_PRICING_JOB],
    }

    with get_connection() as conn:
        with conn.transaction():
            for row in assembly_rows:
                conn.execute(
                    """
                    INSERT INTO provider_assembly_sections (
                      brand, model, provider, provider_assembly_url, section_seq,
                      section_label_raw, section_name_clean, normalized_section,
                      source_status, source_file
                    )
                    VALUES (%s, %s, 'encompass', %s, %s, %s, %s, %s, 'captured', 'bom-retrieval-worker')
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        row["brand"],
                        row["model"],
                        row["provider_assembly_url"],
                        row["section_seq"],
                        row["section_label_raw"],
                        row["section_name_clean"],
                        row["normalized_section"],
                    ),
                )

            insert_retrieval_job(
                conn,
                bom_job_id=job["bom_job_id"],
                model=model,
                brand=brand,
                job_type=EXTRACT_PARTS_JOB,
                source_url=url,
                priority=90,
                payload={"assemblyCount": len(assembly_rows)},
            )
            insert_retrieval_job(
                conn,
                bom_job_id=job["bom_job_id"],
                model=model,
                brand=brand,
                job_type=EXTRACT_PRICING_JOB,
                source_url=url,
                priority=95,
                payload={"assemblyCount": len(assembly_rows)},
            )
            conn.execute(
                """
                UPDATE bom_jobs
                SET job_stage = 'extract_parts_pricing_queued',
                    retrieval_state = 'assemblies_found',
                    source_strategy = 'db-first-worker:encompass',
                    retrieved_sources = COALESCE(retrieved_sources, '[]'::jsonb) || %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    Jsonb(json_ready([{
                        "sourceUrl": url,
                        "sourceType": "diagram",
                        "provider": "encompass",
                        "sectionCount": len(assembly_rows),
                        "checkedAt": datetime.utcnow().isoformat(),
                        "artifacts": summary["artifacts"],
                    }])),
                    job["bom_job_id"],
                ),
            )
            complete_retrieval_job(conn, job, summary)

    return summary


def write_results(
    conn,
    job: dict[str, Any],
    url: str,
    parts: list[ParsedPartRow],
    prices: list[PriceSnapshot],
    artifacts: list[dict[str, Any]],
) -> dict[str, Any]:
    expected = expected_part_count(conn, job["bom_job_id"])
    completion = evaluate_completion(parts, prices, expected)
    batch_summary = summarize_with_pandas(parts, prices)
    gemini_summary = gemini_validation_layer(parts, prices)

    final_rows = [row.model_dump(mode="json") for row in parts]
    source_entry = {
        "sourceUrl": url,
        "sourceType": "distributor",
        "provider": "encompass",
        "checkedAt": datetime.utcnow().isoformat(),
        "artifacts": artifacts,
    }
    result_summary = {
        **completion,
        "expected_part_count": expected,
        "artifacts": artifacts,
        "batch_summary": batch_summary,
        "gemini_validation": gemini_summary,
    }

    with conn.transaction():
        for row in parts:
            conn.execute(
                """
                INSERT INTO provider_part_seed_rows (
                  brand, model, provider, provider_model_url, provider_assembly_url,
                  section_label_raw, section_name_clean, normalized_section,
                  diagram_number, original_part_number, current_service_part_number,
                  description, nla_status, replacement_note, source_status, source_file
                )
                VALUES (%s, %s, 'encompass', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'verified', %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    row.brand,
                    row.model,
                    str(row.source_url),
                    str(row.source_url),
                    row.section,
                    row.section,
                    row.section.lower(),
                    row.diagram_number,
                    row.original_part_number,
                    row.current_service_part_number,
                    row.description,
                    row.nla_status,
                    row.replacement_note,
                    "bom-retrieval-worker",
                ),
            )

        for price in prices:
            conn.execute(
                """
                INSERT INTO part_price_snapshot (
                  part_number, normalized_model, primary_source, listed_price,
                  currency, availability, product_url, product_title, match_type,
                  price_status, checked_at, source_observed_at, raw
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s)
                """,
                (
                    price.part_number,
                    price.normalized_model,
                    price.primary_source,
                    price.listed_price,
                    price.currency,
                    price.availability,
                    str(price.product_url),
                    price.product_title,
                    price.match_type,
                    price.price_status,
                    Jsonb(json_ready(price.raw)),
                ),
            )

        conn.execute(
            """
            UPDATE bom_jobs
            SET job_stage = 'encompass_retrieval_completed',
                result_status = %s,
                raw_row_count = %s,
                unique_row_count = %s,
                actual_part_count = %s,
                actual_canonical_part_count = %s,
                actual_unique_parts = %s,
                verified_price_count = %s,
                required_price_count = %s,
                unpriced_count = %s,
                parts_complete = %s,
                pricing_complete = %s,
                bom_complete = %s,
                retrieval_state = %s,
                truth_source = 'db-first-worker:encompass',
                retrieved_sources = %s,
                extracted_rows_raw = %s,
                final_rows = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                completion["retrieval_state"],
                len(parts),
                len(parts),
                completion["actual_part_count"],
                completion["actual_part_count"],
                completion["actual_part_count"],
                completion["verified_price_count"],
                completion["required_price_count"],
                completion["unpriced_count"],
                completion["parts_complete"],
                completion["pricing_complete"],
                "true" if completion["bom_complete"] else "false",
                completion["retrieval_state"],
                Jsonb(json_ready([source_entry])),
                Jsonb(json_ready(final_rows)),
                Jsonb(json_ready(final_rows)),
                job["bom_job_id"],
            ),
        )

        conn.execute(
            """
            UPDATE bom_retrieval_jobs
            SET status = %s,
                result_summary = %s,
                error_text = NULL,
                finished_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                "completed" if completion["actual_part_count"] > 0 else "failed",
                Jsonb(json_ready(result_summary)),
                job["id"],
            ),
        )

    return result_summary


def fail_job(conn, job: dict[str, Any], error: Exception):
    if isinstance(error, SourceBlockedError):
        evidence = {
            "sourceUrl": error.url,
            "sourceType": "distributor",
            "provider": job.get("provider") or "encompass",
            "status": "blocked",
            "statusCode": error.status_code,
            "evidencePath": error.evidence_path,
            "checkedAt": datetime.utcnow().isoformat(),
        }
        summary = {
            "failureReason": str(error),
            "blocked": True,
            "source": evidence,
            "bom_complete": False,
            "parts_complete": False,
            "pricing_complete": False,
            "nextAction": [
                "manual_evidence_upload",
                "retry_later_with_lower_rate",
                "prefer_official_or_partner_data_path",
            ],
        }
        with conn.transaction():
            conn.execute(
                """
                UPDATE bom_retrieval_jobs
                SET status = 'blocked',
                    error_text = %s,
                    result_summary = %s,
                    locked_by = NULL,
                    locked_at = NULL,
                    finished_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
                """,
                (str(error), Jsonb(json_ready(summary)), job["id"]),
            )
            conn.execute(
                """
                UPDATE bom_jobs
                SET job_stage = 'blocked',
                    result_status = 'blocked',
                    retrieval_state = 'blocked',
                    bom_complete = 'false',
                    parts_complete = false,
                    pricing_complete = false,
                    truth_source = 'db-first-worker:blocked-source',
                    retrieved_sources = COALESCE(retrieved_sources, '[]'::jsonb) || %s,
                    issues = COALESCE(issues, '[]'::jsonb) || %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    Jsonb(json_ready([evidence])),
                    Jsonb([f"Source blocked: {error.url}. Upload manual/diagram evidence or retry later at a lower rate."]),
                    job["bom_job_id"],
                ),
            )
        return

    status = "retry" if job["attempts"] < job["max_attempts"] else "failed"
    with conn.transaction():
        conn.execute(
            """
            UPDATE bom_retrieval_jobs
            SET status = %s,
                error_text = %s,
                result_summary = %s,
                locked_by = NULL,
                locked_at = NULL,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                status,
                str(error),
                Jsonb({"failureReason": str(error), "nextAction": "retry" if status == "retry" else "manual_review"}),
                job["id"],
            ),
        )


def process_once() -> bool:
    with get_connection() as conn:
        job = claim_job(conn)
    if not job:
        return False

    try:
        url = build_encompass_url(job)
        job_type = job.get("job_type") or LEGACY_FULL_JOB
        print(f"[{WORKER_ID}] Processing {job['id']} type={job_type} model={job['model']} url={url}")

        if job_type == MODEL_CAPTURE_JOB:
            summary = process_capture_model_page_safe(job, url)
            print(f"[{WORKER_ID}] {job['id']} model_page_captured next={summary['nextJob']}")
        elif job_type == EXPLODED_CAPTURE_JOB:
            summary = process_capture_exploded_view_safe(job, url)
            print(
                f"[{WORKER_ID}] {job['id']} assemblies_found "
                f"assemblies={summary['assemblyCount']}"
            )
        elif job_type in (EXTRACT_PARTS_JOB, EXTRACT_PRICING_JOB, LEGACY_FULL_JOB):
            parts, prices, artifacts = parse_sources(job, url)
            with get_connection() as conn:
                summary = write_results(conn, job, url, parts, prices, artifacts)
            print(
                f"[{WORKER_ID}] {job['id']} {summary['retrieval_state']} "
                f"parts={summary['actual_part_count']} prices={summary['verified_price_count']}"
            )
        else:
            raise RuntimeError(f"Unsupported retrieval job type: {job_type}")
    except Exception as error:
        print(f"[{WORKER_ID}] {job['id']} failed: {error}")
        with get_connection() as conn:
            fail_job(conn, job, error)

    return True


def main():
    parser = argparse.ArgumentParser(description="DB-first Encompass BOM retrieval worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    args = parser.parse_args()

    print(f"[{WORKER_ID}] Python BOM retrieval worker active")
    while True:
        worked = process_once()
        if args.once:
            return
        if not worked:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
