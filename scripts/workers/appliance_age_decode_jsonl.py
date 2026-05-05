#!/usr/bin/env python3
"""JSONL wrapper for appliance_decoder_patched.py.

Reads one JSON object per line from stdin:
  {"machineId":"...","brandFamily":"GE_FAMILY","serial":"...","model":"..."}

Writes one JSON object per line to stdout with the raw decoder result.
"""

from __future__ import annotations

import json
import sys
import traceback

from appliance_decoder_patched import ApplianceDateDecoder


decoder = ApplianceDateDecoder()


def month_week_to_dict(value):
    if not value:
        return None
    unit = getattr(value, "unit", None)
    unit_value = getattr(unit, "value", None) or str(unit or "")
    return {
        "value": getattr(value, "value", None),
        "unit": unit_value.lower(),
    }


def handle(payload):
    result = decoder.decode(
        brand_family=payload.get("brandFamily") or "UNKNOWN",
        serial=payload.get("serial") or "",
        model=payload.get("model") or "",
        hard_lower_bound_year=payload.get("hardLowerBoundYear"),
        observed_features=payload.get("observedFeatures") or [],
        refrigerant_label=payload.get("refrigerantLabel"),
    )

    return {
        "machineId": payload.get("machineId"),
        "brandFamily": result.brand_family,
        "serial": result.serial,
        "candidatesBefore": result.candidates_before,
        "remainingCandidates": result.remaining_candidates,
        "selectedYear": result.selected_year,
        "timeValue": month_week_to_dict(result.time_value),
        "confidence": result.confidence,
        "resolutionReason": result.resolution_reason,
        "rulesApplied": result.rules_applied,
    }


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        print(json.dumps({"ok": True, "result": handle(json.loads(line))}), flush=True)
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "trace": traceback.format_exc(limit=5),
                }
            ),
            flush=True,
        )
