import "server-only";
import { stripSerialNoise } from "@/features/identity/normalize";
import { resolveDecoderFamily, DecoderFamily } from "@/features/identity/brand-family";

export type SerialConfidence = "low" | "medium" | "high";

export type SerialProfile = {
  brandFamily: DecoderFamily;
  serial: string;
  candidatesBefore: number[];
  remainingCandidates: number[];
  selectedYear: number | null;
  timeValue: { unit: "month" | "week"; value: number } | null;
  confidence: SerialConfidence;
  resolutionReason: string;
  rulesApplied: string[];
  decoded: {
    year: number | null;
    month: number | null;
    week: number | null;
  };
};

export type DecoderOptions = {
  brand: string;
  model?: string;
  hard_lower_bound_year?: number;
  observed_features?: string[];
  refrigerant_label?: string;
};

const GE_MONTH_MAP: Record<string, number> = {
  A: 1, D: 2, F: 3, G: 4, H: 5, L: 6,
  M: 7, R: 8, S: 9, T: 10, V: 11, Z: 12,
};

const GE_YEAR_MAP: Record<string, number[]> = {
  A: [1977, 1989, 2001, 2013, 2025],
  D: [1978, 1990, 2002, 2014, 2026],
  F: [1979, 1991, 2003, 2015],
  G: [1980, 1992, 2004, 2016],
  H: [1981, 1993, 2005, 2017],
  L: [1982, 1994, 2006, 2018],
  M: [1983, 1995, 2007, 2019],
  R: [1984, 1996, 2008, 2020],
  S: [1985, 1997, 2009, 2021],
  T: [1986, 1998, 2010, 2022],
  V: [1987, 1999, 2011, 2023],
  Z: [1988, 2000, 2012, 2024],
};

const WHIRLPOOL_YEAR_MAP: Record<string, number[]> = {
  K: [2000], L: [2001], M: [2002], P: [2003], R: [2004],
  S: [2005], T: [2006], U: [2007], W: [2008], Y: [2009],
  A: [1991, 2021], B: [1992, 2022], C: [1993, 2023], D: [1994, 2024],
  E: [1995], F: [1996], G: [1997], H: [1998], J: [1999],
  "0": [1980, 2010], "1": [1981, 2011], "2": [1982, 2012], "3": [1983, 2013],
  "4": [1984, 2014], "5": [1985, 2015], "6": [1986, 2016], "7": [1987, 2017],
  "8": [1988, 2018], "9": [1989, 2019],
};

const MAYTAG_YEAR_MAP: Record<string, number[]> = {
  A: [1978, 2002], B: [1966, 1990, 2014], C: [1979, 2003],
  D: [1967, 1991], E: [1980, 2004], F: [1968, 1992],
  G: [1981, 2005], H: [1969, 1993], J: [1982, 2006],
  K: [1970, 1994], L: [1983, 2007], M: [1971, 1995],
  N: [1984, 2008], P: [1985, 2009], Q: [1972, 1996],
  R: [1986, 2010], S: [1973, 1997], T: [1987, 2011],
  U: [1974, 1998], V: [1988, 2012], W: [1975, 1999],
  X: [1989, 2013], Y: [1976, 2000], Z: [1977, 2001],
};

const MAYTAG_MONTH_MAP: Record<string, number> = {
  A: 1, B: 1, C: 2, D: 2, E: 3, F: 3,
  G: 4, H: 4, J: 5, K: 5, L: 6, M: 6,
  N: 7, Q: 7, P: 8, S: 8, R: 9, U: 9,
  T: 10, W: 10, V: 11, Y: 11, X: 12, Z: 12,
};

const SAMSUNG_YEAR_MAP: Record<string, number[]> = {
  R: [2001, 2021], T: [2002, 2022], W: [2003, 2023], X: [2004, 2024],
  Y: [2005], A: [2006], L: [2006], P: [2007], Q: [2008],
  S: [2009], Z: [2010], B: [2011], C: [2012], D: [2013],
  E: [2014], G: [2015], H: [2016], J: [2017], K: [2018],
  M: [2019], N: [2020],
};

const SAMSUNG_MONTH_MAP: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
  "7": 7, "8": 8, "9": 9, A: 10, B: 11, C: 12,
};

const SMART_ERA_START = 2010;
const GE_MODERN_BREAKER_START = 2012;
const BOSCH_FD_MIN_YEAR = 1984;
const ALLIANCE_RES_START = 1990;
const ALLIANCE_LOOKBACK_YEARS = 45;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

const SMART_FEATURES = new Set(["wifi", "smartthings", "thinq", "homeconnect", "bluetooth"]);
const MODERN_REFRIGERANTS = new Set(["R600A"]);
const GE_MODERN_CUES = new Set(["wifi", "slate_finish", "qr_code", "url_printed"]);
const REVISION_SUFFIXES = ["/AA", "/02", "REV", "VER", "V2"];
const CYCLIC_FAMILIES = new Set<DecoderFamily>([
  DecoderFamily.GE_FAMILY,
  DecoderFamily.LG,
  DecoderFamily.ELECTROLUX_FAMILY,
  DecoderFamily.MAYTAG_LEGACY,
]);

function uniqueSorted(years: number[]): number[] {
  return [...new Set(years)].filter((year) => year <= MAX_YEAR).sort((a, b) => a - b);
}

function candidateDecades(yearDigit: string): number[] {
  const digit = Number.parseInt(yearDigit, 10);
  if (!Number.isFinite(digit)) return [];
  return uniqueSorted([1990 + digit, 2000 + digit, 2010 + digit, 2020 + digit]);
}

function normalizeFeatures(features: string[] | undefined): Set<string> {
  return new Set((features || []).map((feature) => feature.trim().toLowerCase()).filter(Boolean));
}

function hasAny(haystack: Set<string>, needles: Iterable<string>): boolean {
  for (const needle of needles) {
    if (haystack.has(needle)) return true;
  }
  return false;
}

function emptyProfile(brandFamily: DecoderFamily, serial: string, reason: string): SerialProfile {
  return {
    brandFamily,
    serial,
    candidatesBefore: [],
    remainingCandidates: [],
    selectedYear: null,
    timeValue: null,
    confidence: "low",
    resolutionReason: reason,
    rulesApplied: [],
    decoded: { year: null, month: null, week: null },
  };
}

function singletonConfidence(input: {
  brandFamily: DecoderFamily;
  candidatesBefore: number[];
  hardEliminated: boolean;
  evidenceHard: boolean;
  anyHard: boolean;
  geCycleApplied: boolean;
}): { confidence: SerialConfidence; reason: string } {
  if (input.candidatesBefore.length === 1 && !input.hardEliminated) {
    return { confidence: "high", reason: "Unique decoding result" };
  }
  if (input.brandFamily === DecoderFamily.BOSCH_BSH && input.candidatesBefore.length === 1) {
    return { confidence: "high", reason: "Unique decoding (Bosch FD)" };
  }
  if (input.evidenceHard) {
    return { confidence: "high", reason: "Ambiguity resolved by evidence-based hard eliminators" };
  }
  if (input.geCycleApplied || input.anyHard) {
    return { confidence: "medium", reason: "Ambiguity resolved by hard eliminators" };
  }
  return { confidence: "low", reason: "Singleton after filtering (review recommended)" };
}

export async function decodeSerialNumber(inputSerial: string, options: DecoderOptions): Promise<SerialProfile> {
  const {
    brand,
    model = "",
    hard_lower_bound_year,
    observed_features = [],
    refrigerant_label,
  } = options;

  const serial = stripSerialNoise(inputSerial);
  const brandFamily = resolveDecoderFamily(brand, model);
  if (!serial || brandFamily === DecoderFamily.UNKNOWN) {
    return emptyProfile(brandFamily, serial, "Missing serial or unknown brand family");
  }

  const modelNorm = model.toUpperCase().trim();
  const features = normalizeFeatures(observed_features);
  const refrigerant = (refrigerant_label || "").toUpperCase().trim();
  const rulesApplied: string[] = [];
  let rawCandidates: number[] = [];
  let timeValue: SerialProfile["timeValue"] = null;
  let month: number | null = null;
  let week: number | null = null;

  switch (brandFamily) {
    case DecoderFamily.GE_FAMILY: {
      const match = serial.match(/^([ADFGLMRSTVZ])([ADFGLMRSTVZ])[A-Z0-9]{6,}$/);
      if (match) {
        month = GE_MONTH_MAP[match[1]] ?? null;
        rawCandidates = GE_YEAR_MAP[match[2]] || [];
        if (month) timeValue = { unit: "month", value: month };
      }
      break;
    }
    case DecoderFamily.WHIRLPOOL_FAMILY: {
      const match = serial.match(/^[A-Z]([A-Z0-9])(\d{2})[A-Z0-9]+$/);
      if (match) {
        const weekValue = Number.parseInt(match[2], 10);
        if (weekValue >= 1 && weekValue <= 53) {
          week = weekValue;
          rawCandidates = WHIRLPOOL_YEAR_MAP[match[1]] || [];
          timeValue = { unit: "week", value: week };
        }
      }
      break;
    }
    case DecoderFamily.MAYTAG_LEGACY: {
      const match = serial.match(/^[A-Z0-9]+([A-Z])([A-Z])$/);
      if (match) {
        rawCandidates = MAYTAG_YEAR_MAP[match[1]] || [];
        month = MAYTAG_MONTH_MAP[match[2]] ?? null;
        if (month) timeValue = { unit: "month", value: month };
      }
      break;
    }
    case DecoderFamily.ELECTROLUX_FAMILY: {
      const match = serial.match(/^[A-Z0-9]{2}(\d)(\d{2})\d+$/);
      if (match) {
        const weekValue = Number.parseInt(match[2], 10);
        if (weekValue >= 1 && weekValue <= 53) {
          week = weekValue;
          rawCandidates = candidateDecades(match[1]);
          timeValue = { unit: "week", value: week };
        }
      }
      break;
    }
    case DecoderFamily.LG: {
      const match = serial.match(/^(\d)(\d{2})[A-Z0-9]+$/);
      if (match) {
        rawCandidates = candidateDecades(match[1]);
        const value = Number.parseInt(match[2], 10);
        if (value >= 1 && value <= 12) {
          month = value;
          timeValue = { unit: "month", value };
        } else if (value >= 1 && value <= 53) {
          week = value;
          timeValue = { unit: "week", value };
        }
      }
      break;
    }
    case DecoderFamily.BOSCH_BSH: {
      const match = serial.match(/^FD(\d{2})(\d{2})\d+$/);
      if (match) {
        const fdYear = Number.parseInt(match[1], 10);
        const fdMonth = Number.parseInt(match[2], 10);
        if (fdMonth >= 1 && fdMonth <= 12) {
          const decodedYear = fdYear <= 19 ? 2020 + fdYear : 1920 + fdYear;
          rawCandidates = decodedYear >= BOSCH_FD_MIN_YEAR ? [decodedYear] : [];
          month = fdMonth;
          timeValue = { unit: "month", value: month };
        }
      }
      break;
    }
    case DecoderFamily.SAMSUNG: {
      const match =
        serial.length === 15
          ? serial.match(/^[A-Z0-9]{7}([A-Z0-9])([1-9ABC])[A-Z0-9]{6}$/)
          : serial.length === 11
            ? serial.match(/^[A-Z0-9]{3}([A-Z0-9])([1-9ABC])[A-Z0-9]{6}$/)
            : null;
      if (match) {
        rawCandidates = SAMSUNG_YEAR_MAP[match[1]] || [];
        month = SAMSUNG_MONTH_MAP[match[2]] ?? null;
        if (month) timeValue = { unit: "month", value: month };
      }
      break;
    }
    case DecoderFamily.ALLIANCE: {
      const match = serial.match(/^(\d{2})(\d{2})\d+$/);
      if (match) {
        const yy = Number.parseInt(match[1], 10);
        const mm = Number.parseInt(match[2], 10);
        if (mm >= 1 && mm <= 12) {
          const startYear = Math.max(ALLIANCE_RES_START, MAX_YEAR - ALLIANCE_LOOKBACK_YEARS + 1);
          rawCandidates = [];
          for (let year = startYear; year <= MAX_YEAR; year += 1) {
            if (year % 100 === yy) rawCandidates.push(year);
          }
          month = mm;
          timeValue = { unit: "month", value: month };
        }
      }
      break;
    }
  }

  const candidatesBefore = uniqueSorted(rawCandidates);
  if (candidatesBefore.length === 0) {
    return {
      ...emptyProfile(brandFamily, serial, "Pattern match failed or invalid codes"),
      timeValue,
      decoded: { year: null, month, week },
    };
  }

  let remaining = [...candidatesBefore];
  let evidenceHard = false;
  let anyHard = false;
  let geCycleApplied = false;

  if (typeof hard_lower_bound_year === "number") {
    const before = remaining.length;
    remaining = remaining.filter((year) => year >= hard_lower_bound_year);
    if (remaining.length < before) {
      rulesApplied.push(`hard_lower_bound_year>=${hard_lower_bound_year}`);
      evidenceHard = true;
      anyHard = true;
    }
  }

  const hasSmart = hasAny(features, SMART_FEATURES);
  const hasModernRefrigerant = MODERN_REFRIGERANTS.has(refrigerant);
  if (hasSmart || hasModernRefrigerant) {
    const before = remaining.length;
    remaining = remaining.filter((year) => year >= SMART_ERA_START);
    if (remaining.length < before) {
      rulesApplied.push(`hard_modern_features>=${SMART_ERA_START}`);
      evidenceHard = true;
      anyHard = true;
    }
  }

  if (brandFamily === DecoderFamily.GE_FAMILY && hasAny(features, GE_MODERN_CUES)) {
    const before = remaining.length;
    remaining = remaining.filter((year) => year >= GE_MODERN_BREAKER_START);
    if (remaining.length < before) {
      rulesApplied.push(`hard_ge_modern_breaker>=${GE_MODERN_BREAKER_START}`);
      geCycleApplied = true;
      anyHard = true;
    }
  }

  if (remaining.length === 0) {
    return {
      brandFamily,
      serial,
      candidatesBefore,
      remainingCandidates: [],
      selectedYear: null,
      timeValue,
      confidence: "low",
      resolutionReason: "Hard eliminators removed all candidates",
      rulesApplied: [...rulesApplied, "all_eliminated"],
      decoded: { year: null, month, week },
    };
  }

  const hardEliminated = remaining.length < candidatesBefore.length;
  if (remaining.length === 1) {
    const { confidence, reason } = singletonConfidence({
      brandFamily,
      candidatesBefore,
      hardEliminated,
      evidenceHard,
      anyHard,
      geCycleApplied,
    });
    return {
      brandFamily,
      serial,
      candidatesBefore,
      remainingCandidates: remaining,
      selectedYear: remaining[0],
      timeValue,
      confidence,
      resolutionReason: reason,
      rulesApplied,
      decoded: { year: remaining[0], month, week },
    };
  }

  const sortedDesc = [...remaining].sort((a, b) => b - a);
  let selectedYear = sortedDesc[0];
  let softUsed = false;

  if (REVISION_SUFFIXES.some((suffix) => modelNorm.includes(suffix))) {
    rulesApplied.push("soft_revision_suffix->newest");
    softUsed = true;
  } else if (hasAny(features, ["qr_code", "url_printed"])) {
    rulesApplied.push("soft_qr_or_url->newest");
    softUsed = true;
  } else if (features.has("modern_style")) {
    rulesApplied.push("soft_modern_style->newest");
    softUsed = true;
  } else if (features.has("vintage_style")) {
    selectedYear = Math.min(...remaining);
    rulesApplied.push("soft_vintage_style->oldest");
    softUsed = true;
  } else if (CYCLIC_FAMILIES.has(brandFamily)) {
    const previous = sortedDesc[1];
    const newestTooRecent = selectedYear >= CURRENT_YEAR - 1;
    if (previous && newestTooRecent && previous <= CURRENT_YEAR && CURRENT_YEAR - previous <= 15) {
      selectedYear = previous;
      rulesApplied.push("default_cycle->previous_plausible");
    } else {
      rulesApplied.push("default->newest");
    }
  } else {
    rulesApplied.push("default->newest");
  }

  return {
    brandFamily,
    serial,
    candidatesBefore,
    remainingCandidates: remaining,
    selectedYear,
    timeValue,
    confidence: "low",
    resolutionReason: softUsed ? "Resolved via soft cues" : "Resolved via default preference",
    rulesApplied,
    decoded: { year: selectedYear, month, week },
  };
}
