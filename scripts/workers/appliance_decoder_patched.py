'''
appliance_decoder.py

Deterministically derives manufacture dates from RESIDENTIAL appliance serial
numbers using a "Waterfall" logic pipeline:
    Regex -> Validation -> Candidate Generation -> Hard Eliminators -> Soft Scoring

Supported Families:
    GE, WHIRLPOOL, MAYTAG (Legacy), ELECTROLUX, LG, BOSCH, SAMSUNG, ALLIANCE (Res)

Rules:
1. Hard Eliminators (Smart features, R600a, known component dates) REMOVE candidates.
   - If ambiguity is resolved via evidence-based Hard Eliminators (component dates, 
     smart features, etc.), Confidence = HIGH.
   - Other hard eliminator resolutions default to MEDIUM.
2. Soft Cues (Model revisions, style) BIAS selection among remaining.
   - If ambiguity is resolved via Soft Cues, Confidence = LOW.
3. Alliance Commercial models are excluded; only residential YYMM pattern is supported.
'''

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DecoderConfig:
    '''Centralized configuration for decoder constants.'''
    smart_era_start: int = 2010
    ge_modern_breaker_start: int = 2012
    alliance_res_start: int = 1990
    max_year_buffer: int = 1
    strict_week_validation: bool = False


# ---------------------------------------------------------------------------
# Time Value Types
# ---------------------------------------------------------------------------

class TimeUnit(Enum):
    '''Enumeration for time unit types.'''
    MONTH = "month"
    WEEK = "week"


@dataclass(frozen=True)
class TimeValue:
    '''Represents either a month (1-12) or week (1-53) value.'''
    value: int
    unit: TimeUnit

    def __post_init__(self):
        if self.unit == TimeUnit.MONTH and not (1 <= self.value <= 12):
            raise ValueError(f"Month must be 1-12, got {self.value}")
        if self.unit == TimeUnit.WEEK and not (1 <= self.value <= 53):
            raise ValueError(f"Week must be 1-53, got {self.value}")

    def __str__(self) -> str:
        return f"{self.unit.value.capitalize()} {self.value}"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CURRENT_YEAR = datetime.datetime.now().year

# Feature Sets
SMART_FEATURES = frozenset({"wifi", "smartthings", "thinq", "homeconnect", "bluetooth"})
MODERN_REFRIGERANTS = frozenset({"R600A"})
GE_MODERN_CUES = frozenset({"wifi", "slate_finish", "qr_code"})

# Model Suffixes indicating newer revisions (Soft Cues)
REVISION_SUFFIXES = ("/AA", "/02", "REV", "VER", "V2")

# ---------------------------------------------------------------------------
# Lookup Tables
# ---------------------------------------------------------------------------

# GE Month Map
GE_MONTH_MAP: Dict[str, int] = {
    'A': 1, 'D': 2, 'F': 3, 'G': 4, 'H': 5, 'L': 6,
    'M': 7, 'R': 8, 'S': 9, 'T': 10, 'V': 11, 'Z': 12
}

# GE Year Cycle (12-year cycle)
GE_YEAR_MAP: Dict[str, List[int]] = {
    'A': [1977, 1989, 2001, 2013, 2025],
    'D': [1978, 1990, 2002, 2014, 2026],
    'F': [1979, 1991, 2003, 2015],
    'G': [1980, 1992, 2004, 2016],
    'H': [1981, 1993, 2005, 2017],
    'L': [1982, 1994, 2006, 2018],
    'M': [1983, 1995, 2007, 2019],
    'R': [1984, 1996, 2008, 2020],
    'S': [1985, 1997, 2009, 2021],
    'T': [1986, 1998, 2010, 2022],
    'V': [1987, 1999, 2011, 2023],
    'Z': [1988, 2000, 2012, 2024],
}

# Valid GE characters (intersection of month and year maps)
GE_VALID_CHARS = frozenset(GE_MONTH_MAP.keys()) & frozenset(GE_YEAR_MAP.keys())

# Whirlpool (Letter cycles 30 years or Decade digits)
WHIRLPOOL_YEAR_MAP: Dict[str, List[int]] = {
    # Letter codes (2000-2009)
    'K': [2000], 'L': [2001], 'M': [2002], 'P': [2003], 'R': [2004],
    'S': [2005], 'T': [2006], 'U': [2007], 'W': [2008], 'Y': [2009],
    # Letter codes (1990s / 2020s overlaps)
    'A': [1991, 2021], 'B': [1992, 2022], 'C': [1993, 2023], 'D': [1994, 2024],
    'E': [1995], 'F': [1996], 'G': [1997], 'H': [1998], 'J': [1999],
    # Digit codes (1980s, 2010s)
    '0': [1980, 2010], '1': [1981, 2011], '2': [1982, 2012], '3': [1983, 2013],
    '4': [1984, 2014], '5': [1985, 2015], '6': [1986, 2016], '7': [1987, 2017],
    '8': [1988, 2018], '9': [1989, 2019],
}

# Maytag Legacy (Newton, IA)
MAYTAG_YEAR_MAP: Dict[str, List[int]] = {
    'A': [1978, 2002], 'B': [1966, 1990, 2014], 'C': [1979, 2003],
    'D': [1967, 1991], 'E': [1980, 2004], 'F': [1968, 1992],
    'G': [1981, 2005], 'H': [1969, 1993], 'J': [1982, 2006],
    'K': [1970, 1994], 'L': [1983, 2007], 'M': [1971, 1995],
    'N': [1984, 2008], 'P': [1985, 2009], 'Q': [1972, 1996],
    'R': [1986, 2010], 'S': [1973, 1997], 'T': [1987, 2011],
    'U': [1974, 1998], 'V': [1988, 2012], 'W': [1975, 1999],
    'X': [1989, 2013], 'Y': [1976, 2000], 'Z': [1977, 2001],
}

MAYTAG_MONTH_MAP: Dict[str, int] = {
    'A': 1, 'B': 1, 'C': 2, 'D': 2, 'E': 3, 'F': 3,
    'G': 4, 'H': 4, 'J': 5, 'K': 5, 'L': 6, 'M': 6,
    'N': 7, 'Q': 7, 'P': 8, 'S': 8, 'R': 9, 'U': 9,
    'T': 10, 'W': 10, 'V': 11, 'Y': 11, 'X': 12, 'Z': 12,
}

# Samsung
SAMSUNG_MONTH_MAP: Dict[str, int] = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, 'A': 10, 'B': 11, 'C': 12
}

SAMSUNG_YEAR_MAP: Dict[str, List[int]] = {
    'R': [2001, 2021], 'T': [2002, 2022], 'W': [2003, 2023], 'X': [2004, 2024],
    'Y': [2005], 'A': [2006], 'L': [2006], 'P': [2007], 'Q': [2008],
    'S': [2009], 'Z': [2010], 'B': [2011], 'C': [2012], 'D': [2013],
    'E': [2014], 'G': [2015], 'H': [2016], 'J': [2017], 'K': [2018],
    'M': [2019], 'N': [2020],
}

# ---------------------------------------------------------------------------
# Regex Patterns
# ---------------------------------------------------------------------------

# Helper strings for regex construction
_GE_MONTH_CHARS = ''.join(sorted(GE_MONTH_MAP.keys()))
_GE_YEAR_CHARS = ''.join(sorted(GE_YEAR_MAP.keys()))
_SAMSUNG_MONTH_CHARS = ''.join(sorted(SAMSUNG_MONTH_MAP.keys()))

PATTERNS: Dict[str, Dict[str, Any]] = {
    "GE_FAMILY": {
        "brand": "GE",
        # Restrict to valid GE month/year characters only
        "regex": re.compile(
            rf"^(?P<month>[{_GE_MONTH_CHARS}])(?P<year>[{_GE_YEAR_CHARS}])[A-Z0-9]{6,}$"
        ),
    },
    "WHIRLPOOL_FAMILY": {
        "brand": "WHIRLPOOL",
        "regex": re.compile(r"^[A-Z](?P<year>[A-Z0-9])(?P<week>\d{2})[A-Z0-9]+$"),
    },
    "MAYTAG_LEGACY": {
        "brand": "MAYTAG",
        "regex": re.compile(r"^[A-Z0-9]+(?P<year>[A-Z])(?P<month>[A-Z])$"),
    },
    "ELECTROLUX_FAMILY": {
        "brand": "ELECTROLUX",
        "regex": re.compile(r"^[A-Z0-9]{2}(?P<year>\d)(?P<week>\d{2})\d+$"),
    },
    "LG": {
        "brand": "LG",
        "regex": re.compile(r"^(?P<year>\d)(?P<week>\d{2})[A-Z0-9]+$"),
    },
    "BOSCH_BSH": {
        "brand": "BOSCH",
        "regex": re.compile(r"^FD(?P<year>\d{2})(?P<month>\d{2})\d+$"),
    },
    "SAMSUNG": {
        "brand": "SAMSUNG",
        # 15 char: 8th=Year, 9th=Month
        "regex_15": re.compile(
            rf"^[A-Z0-9]{7}(?P<year>[A-Z0-9])(?P<month>[{_SAMSUNG_MONTH_CHARS}])[A-Z0-9]{6}$"
        ),
        # 11 char: 4th=Year, 5th=Month
        "regex_11": re.compile(
            rf"^[A-Z0-9]{3}(?P<year>[A-Z0-9])(?P<month>[{_SAMSUNG_MONTH_CHARS}])[A-Z0-9]{6}$"
        ),
    },
    "ALLIANCE": {
        "brand": "ALLIANCE",
        # Residential: YYMM + Sequence. Commercial excluded.
        "regex": re.compile(r"^(?P<year>\d{2})(?P<month>\d{2})\d+$"),
    },
}

# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class DecodeResult:
    brand_family: str
    serial: str
    candidates_before: List[int]
    remaining_candidates: List[int]
    selected_year: Optional[int]
    month_or_week: Any
    confidence: str
    resolution_reason: str
    rules_applied: List[str] = field(default_factory=list)

    @property
    def time_value(self) -> Optional[TimeValue]:
        '''Alias for backward compatibility if needed.'''
        return self.month_or_week

# ---------------------------------------------------------------------------
# Decoder Logic
# ---------------------------------------------------------------------------

class ApplianceDateDecoder:
    def __init__(self, current_year: int = CURRENT_YEAR, max_year: int = -1):
        self.current_year = current_year
        # Allow 1 year into future for production overlap/model years
        self.max_year = max_year if max_year > 0 else (current_year + 1)
        self.config = DecoderConfig()

    def decode(
        self,
        brand_family: str,
        serial: str,
        model: str = "",
        hard_lower_bound_year: Optional[int] = None,
        observed_features: Optional[List[str]] = None,
        refrigerant_label: Optional[str] = None,
    ) -> DecodeResult:
        '''
        Decode a serial number to determine manufacture date.
        '''
        serial_norm = self._normalize(serial)
        model_norm = (model or "").strip().upper()
        feats = {f.strip().lower() for f in (observed_features or []) if f and f.strip()}
        refr = (refrigerant_label or "").strip().upper()

        rules: List[str] = []

        # 1. Pattern Matching
        match_data = self._match_pattern(brand_family, serial_norm)
        if not match_data:
            return self._fail(brand_family, serial_norm, "Pattern match failed (or Commercial model excluded)")

        rules.append(f"matched_{match_data['brand']}")

        # 2. Candidate Generation
        candidates, time_val, err = self._extract_candidates(brand_family, match_data)
        if err:
            return self._fail(brand_family, serial_norm, f"Validation error: {err}", rules)

        # 3. Sanity Filter (Future dates)
        candidates = sorted({y for y in candidates if y <= self.max_year})
        candidates_before = list(candidates)

        if not candidates:
            return self._fail(
                brand_family, serial_norm,
                "All candidates exceed max allowed year",
                rules + ["no_candidates_in_window"]
            )

        # 4. Hard Eliminators
        remaining, hard_rules = self._apply_hard_eliminators(
            candidates=candidates,
            brand_family=brand_family,
            hard_lower_bound_year=hard_lower_bound_year,
            features=feats,
            refrigerant=refr,
        )
        rules.extend(hard_rules)

        if not remaining:
            return DecodeResult(
                brand_family, serial_norm,
                candidates_before, [],
                None, time_val, "low",
                "Hard eliminators removed all candidates",
                rules + ["all_eliminated"]
            )

        hard_eliminated = len(remaining) < len(candidates_before)

        # 5. Selection & Confidence
        return self._select_and_score(
            brand_family=brand_family,
            serial=serial_norm,
            candidates_before=candidates_before,
            remaining=remaining,
            time_val=time_val,
            hard_eliminated=hard_eliminated,
            model=model_norm,
            features=feats,
            rules=rules,
        )

    # -----------------------------------------------------------------------
    # Internal Logic
    # -----------------------------------------------------------------------

    def _normalize(self, val: str) -> str:
        return (val or "").upper().replace("-", "").replace(" ", "").strip()

    def _fail(self, fam: str, ser: str, reason: str, rules: List[str] = None) -> DecodeResult:
        return DecodeResult(fam, ser, [], [], None, None, "low", reason, rules or [])

    def _match_pattern(self, brand_family: str, serial: str) -> Optional[Dict[str, str]]:
        cfg = PATTERNS.get(brand_family)
        if not cfg:
            return None

        brand = cfg["brand"]

        if brand_family == "SAMSUNG":
            # Check 15-char then 11-char
            for regex_key, expected_len in [("regex_15", 15), ("regex_11", 11)]:
                if len(serial) == expected_len:
                    m = cfg[regex_key].match(serial)
                    if m: return {"brand": brand, **m.groupdict()}
            return None

        if brand_family == "ALLIANCE":
            # RESIDENTIAL ONLY
            m = cfg["regex"].match(serial)
            if m: return {"brand": brand, **m.groupdict()}
            # Commercial models fall through here -> returns None
            return None

        regex = cfg.get("regex")
        if regex:
            m = regex.match(serial)
            if m: return {"brand": brand, **m.groupdict()}

        return None

    def _extract_candidates(self, brand_family: str, data: Dict[str, str]) -> Tuple[List[int], Any, Optional[str]]:
        brand = data.get("brand")

        if brand == "GE":
            m_char, y_char = data.get("month", ""), data.get("year", "")
            # Regex enforces valid chars, but double check maps
            if m_char not in GE_MONTH_MAP or y_char not in GE_YEAR_MAP:
                return [], None, "Invalid GE code in map lookup"
            return GE_YEAR_MAP[y_char][:], TimeValue(GE_MONTH_MAP[m_char], TimeUnit.MONTH), None

        if brand == "WHIRLPOOL":
            y_code, week_s = data.get("year", ""), data.get("week", "")
            if not week_s.isdigit() or not (1 <= int(week_s) <= 53):
                return [], None, f"Invalid Week '{week_s}'"
            if y_code not in WHIRLPOOL_YEAR_MAP:
                return [], None, f"Invalid WP Year '{y_code}'"
            return WHIRLPOOL_YEAR_MAP[y_code][:], TimeValue(int(week_s), TimeUnit.WEEK), None

        if brand == "MAYTAG":
            y_code, m_code = data.get("year", ""), data.get("month", "")
            if y_code not in MAYTAG_YEAR_MAP:
                return [], None, f"Invalid Maytag Year '{y_code}'"
            if m_code not in MAYTAG_MONTH_MAP:
                return [], None, f"Invalid Maytag Month '{m_code}'"
            # Fix: Ensure candidates are returned in ascending order
            return sorted(MAYTAG_YEAR_MAP[y_code]), TimeValue(MAYTAG_MONTH_MAP[m_code], TimeUnit.MONTH), None

        if brand in ("ELECTROLUX", "LG"):
            y_digit, week_s = data.get("year", ""), data.get("week", "")
            if not (1 <= int(week_s) <= 53):
                return [], None, f"Invalid Week '{week_s}'"
            digit = int(y_digit)
            years = [dec + digit for dec in (1990, 2000, 2010, 2020) if 1990 <= dec + digit <= self.max_year]
            return years, TimeValue(int(week_s), TimeUnit.WEEK), None

        if brand == "BOSCH":
            y_str, m_str = data.get("year", ""), data.get("month", "")
            month = int(m_str)
            if not (1 <= month <= 12):
                return [], None, f"Invalid Month '{month}'"
            fd_val = int(y_str)
            # Bosch FD Century Logic Fix
            # FD is Year + 20. 
            # FD 01-19 -> 2021-2039
            # FD 20-79 -> 1940-1999
            # FD 80-99 -> 2000-2019
            if 0 <= fd_val <= 19:
                year = 2020 + fd_val
            elif 20 <= fd_val <= 79:
                year = 1920 + fd_val
            else: # 80-99
                year = 1920 + fd_val # 1920 + 80 = 2000
            return [year], TimeValue(month, TimeUnit.MONTH), None

        if brand == "SAMSUNG":
            y_code, m_code = data.get("year", ""), data.get("month", "")
            if y_code not in SAMSUNG_YEAR_MAP:
                return [], None, f"Invalid Samsung Year '{y_code}'"
            if m_code not in SAMSUNG_MONTH_MAP:
                return [], None, f"Invalid Samsung Month '{m_code}'"
            return SAMSUNG_YEAR_MAP[y_code][:], TimeValue(SAMSUNG_MONTH_MAP[m_code], TimeUnit.MONTH), None

        if brand == "ALLIANCE":
            # Residential YYMM
            yy, mm = data.get("year", ""), data.get("month", "")
            month = int(mm)
            if not (1 <= month <= 12):
                return [], None, f"Invalid Month '{mm}'"
            
            yy_int = int(yy)
            # Generate valid years ending in YY from start_date to max_year
            years = [y for y in range(self.config.alliance_res_start, self.max_year + 1) if y % 100 == yy_int]
            return years, TimeValue(month, TimeUnit.MONTH), None

        return [], None, f"Brand '{brand}' implementation missing"

    def _apply_hard_eliminators(
        self,
        candidates: List[int],
        brand_family: str,
        hard_lower_bound_year: Optional[int],
        features: frozenset,
        refrigerant: str,
    ) -> Tuple[List[int], List[str]]:
        remaining = list(candidates)
        rules = []

        # 1. Explicit Lower Bound
        if hard_lower_bound_year:
            pre = len(remaining)
            remaining = [y for y in remaining if y >= hard_lower_bound_year]
            if len(remaining) < pre:
                rules.append(f"hard_lower_bound>={hard_lower_bound_year}")

        # 2. Smart / Refrigerant
        is_smart = bool(SMART_FEATURES & features)
        is_modern_refr = refrigerant in MODERN_REFRIGERANTS
        if is_smart or is_modern_refr:
            pre = len(remaining)
            remaining = [y for y in remaining if y >= self.config.smart_era_start]
            if len(remaining) < pre:
                rules.append(f"hard_modern_features>={self.config.smart_era_start}")

        # 3. GE Cycle Breaker
        if brand_family == "GE_FAMILY" and (GE_MODERN_CUES & features):
            pre = len(remaining)
            remaining = [y for y in remaining if y >= self.config.ge_modern_breaker_start]
            if len(remaining) < pre:
                rules.append(f"hard_ge_cycle>={self.config.ge_modern_breaker_start}")

        return remaining, rules

    def _select_and_score(
        self,
        brand_family: str,
        serial: str,
        candidates_before: List[int],
        remaining: List[int],
        time_val: Any,
        hard_eliminated: bool,
        model: str,
        features: frozenset,
        rules: List[str],
    ) -> DecodeResult:
        
        # Singleton logic
        if len(remaining) == 1:
            selected = remaining[0]
            if brand_family == "BOSCH_BSH":
                conf = "high"
                reason = "Unique decoding (Bosch FD)"
            elif len(candidates_before) == 1 and not hard_eliminated:
                conf = "high"
                reason = "Unique decoding result"
            elif hard_eliminated:
                conf = "medium"
                reason = "Ambiguity resolved by hard eliminators"
            else:
                conf = "low"
                reason = "Singleton after filtering (review recommended)"
            
            return DecodeResult(
                brand_family, serial, candidates_before, remaining,
                selected, time_val, conf, reason, rules
            )

        # Ambiguous logic - Soft Scoring
        remaining_sorted = sorted(remaining, reverse=True)
        selected_year = None
        
        # Soft 1: Suffix
        if any(s in model for s in REVISION_SUFFIXES):
            selected_year = remaining_sorted[0]
            rules.append("soft_revision_suffix->newest")
        
        # Soft 2: Modern visual cues
        elif ({"url_printed", "qr_code"} & features) or "modern_style" in features:
            selected_year = remaining_sorted[0]
            rules.append("soft_modern_cues->newest")
            
        # Soft 3: Vintage visual cues
        elif "vintage_style" in features:
            selected_year = sorted(remaining)[0]
            rules.append("soft_vintage_style->oldest")
        # Fallback (cycle-aware for cyclic brands)
        else:
            newest = remaining_sorted[0]
            prev = remaining_sorted[1] if len(remaining_sorted) > 1 else None

            # Improved fallback logic for brands with repeating year cycles:
            # Prefer a previous cycle year if the newest candidate is in the future
            # or extremely recent, and the previous cycle is still plausibly "modern"
            # (not older than 15 years).
            cyclic_families = {"GE_FAMILY", "LG", "ELECTROLUX_FAMILY", "MAYTAG_LEGACY"}
            too_recent = newest >= (self.current_year - 1)
            in_future = newest > self.current_year

            if brand_family in cyclic_families and prev is not None and (in_future or too_recent):
                prev_age = self.current_year - prev
                if 0 <= prev_age <= 15 and prev <= self.current_year:
                    selected_year = prev
                    rules.append("default_cycle->previous_plausible")
                else:
                    selected_year = newest
                    rules.append("default->newest")
            else:
                selected_year = newest
                rules.append("default->newest")

        return DecodeResult(
            brand_family, serial, candidates_before, remaining,
            selected_year, time_val, "low", "Resolved via soft cues/defaults", rules
        )

# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    decoder = ApplianceDateDecoder()
    tests = [
        {"f": "WHIRLPOOL_FAMILY", "s": "SU1727374", "m": "GS6NBEXRL02"},
        {"f": "SAMSUNG", "s": "B078G8DK901569A", "feat": ["smartthings"]},
        {"f": "GE_FAMILY", "s": "SL621054Q", "feat": ["slate_finish"]}, # Should elim old dates
        {"f": "ALLIANCE", "s": "2403123456"}, # Residential
        {"f": "ALLIANCE", "s": "12345678AB"}, # Commercial (Should Fail Pattern)
    ]

    print(f"{'FAMILY':<18} | {'SERIAL':<15} | {'REMAIN':<18} | {'CONF':<6} | REASON")
    print("-" * 100)
    for t in tests:
        r = decoder.decode(
            brand_family=t["f"], serial=t["s"], model=t.get("m", ""),
            observed_features=t.get("feat")
        )
        rem = str(r.remaining_candidates)
        print(f"{r.brand_family:<18} | {r.serial:<15} | {rem:<18} | {r.confidence:<6} | {r.resolution_reason}")

