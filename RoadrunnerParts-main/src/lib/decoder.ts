
export enum TimeUnit {
  MONTH = "month",
  WEEK = "week"
}

export interface TimeValue {
  value: number;
  unit: TimeUnit;
}

export interface DecodeResult {
  brandFamily: string;
  serial: string;
  manufactureYear: number | null;
  timeValue: TimeValue | null;
  confidence: "high" | "medium" | "low";
  resolutionReason: string;
  candidatesInitial: number[];
  remainingCandidates: number[];
  rulesApplied: string[];
}

const SMART_ERA_START = 2010;
const GE_MODERN_BREAKER_START = 2012;
const MAX_YEAR_BUFFER = 1;

const SMART_FEATURES = new Set(["wifi", "smartthings", "thinq", "homeconnect", "bluetooth", "smart_diagnosis"]);
const MODERN_REFRIGERANTS = new Set(["R600A", "R290"]);
const GE_MODERN_CUES = new Set(["wifi", "slate_finish", "qr_code", "url_printed"]);
const REVISION_SUFFIXES = ["/AA", "/AB", "/02", "REV", "VER", "V2"];

const GE_MONTH_MAP: Record<string, number> = {
  "A": 1, "D": 2, "F": 3, "G": 4, "H": 5, "L": 6,
  "M": 7, "R": 8, "S": 9, "T": 10, "V": 11, "Z": 12
};

const GE_YEAR_MAP: Record<string, number[]> = {
  "A": [1977, 1989, 2001, 2013, 2025],
  "D": [1978, 1990, 2002, 2014, 2026],
  "F": [1979, 1991, 2003, 2015],
  "G": [1980, 1992, 2004, 2016],
  "H": [1981, 1993, 2005, 2017],
  "L": [1982, 1994, 2006, 2018],
  "M": [1983, 1995, 2007, 2019],
  "R": [1984, 1996, 2008, 2020],
  "S": [1985, 1997, 2009, 2021],
  "T": [1986, 1998, 2010, 2022],
  "V": [1987, 1999, 2011, 2023],
  "Z": [1988, 2000, 2012, 2024],
};

const WHIRLPOOL_YEAR_MAP: Record<string, number[]> = {
  "K": [2000], "L": [2001], "M": [2002], "P": [2003], "R": [2004],
  "S": [2005], "T": [2006], "U": [2007], "W": [2008], "Y": [2009],
  "A": [1991, 2021], "B": [1992, 2022], "C": [1993, 2023], "D": [1994, 2024],
  "E": [1995], "F": [1996], "G": [1997], "H": [1998], "J": [1999],
  "0": [1980, 2010], "1": [1981, 2011], "2": [1982, 2012], "3": [1983, 2013],
  "4": [1984, 2014], "5": [1985, 2015], "6": [1986, 2016], "7": [1987, 2017],
  "8": [1988, 2018], "9": [1989, 2019],
};

const SAMSUNG_YEAR_MAP: Record<string, number[]> = {
  "R": [2001, 2021], "T": [2002, 2022], "W": [2003, 2023], "X": [2004, 2024],
  "Y": [2005], "A": [2006], "L": [2006], "P": [2007], "Q": [2008],
  "S": [2009], "Z": [2010], "B": [2011], "C": [2012], "D": [2013],
  "E": [2014], "G": [2015], "H": [2016], "J": [2017], "K": [2018],
  "M": [2019], "N": [2020],
};

const SAMSUNG_MONTH_MAP: Record<string, number> = {
  ...Object.fromEntries(Array.from({length: 9}, (_, i) => [String(i + 1), i + 1])),
  "A": 10, "B": 11, "C": 12
};

export class ApplianceDecoder {
  private maxYear: number;

  constructor(currentYear: number = new Date().getFullYear()) {
    this.maxYear = currentYear + MAX_YEAR_BUFFER;
  }

  private normalize(val: string): string {
    return val.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  decode(serial: string, model: string = "", features: string[] = [], refrigerant: string = ""): DecodeResult {
    const s = this.normalize(serial);
    const m = model.toUpperCase();
    const feats = new Set(features.map(f => f.toLowerCase()));
    const refr = refrigerant.toUpperCase().trim();

    let brand = "Universal";
    let candidates: number[] = [];
    let timeVal: TimeValue | null = null;
    const rules: string[] = [];

    // --- 1. Regex & Initial Candidate Generation ---

    // Whirlpool Family (including 9 vs 10 digit variants)
    const wpMatch = s.match(/^[A-Z]([A-Z0-9])(\d{2})[A-Z0-9]+$/);
    if (wpMatch) {
      brand = "Whirlpool";
      // 10-digit rule: if length is 10, use 3rd char? 
      // The docs say: if 10, use 3rd char; if 9, use 2nd. Index-wise: Index 2 vs Index 1.
      const yearIndex = s.length === 10 ? 2 : 1;
      const yearCode = s[yearIndex];
      const week = parseInt(wpMatch[2]);
      if (WHIRLPOOL_YEAR_MAP[yearCode] && week >= 1 && week <= 53) {
        candidates = [...WHIRLPOOL_YEAR_MAP[yearCode]];
        timeVal = { value: week, unit: TimeUnit.WEEK };
        rules.push(`matched_Whirlpool_${s.length}dig`);
      }
    }

    // GE Family
    const geMatch = s.match(/^([A-Z])([A-Z])[A-Z0-9]{6,}$/);
    if (geMatch && !timeVal) {
      const monthCode = geMatch[1];
      const yearCode = geMatch[2];
      if (GE_MONTH_MAP[monthCode] && GE_YEAR_MAP[yearCode]) {
        brand = "GE";
        candidates = [...GE_YEAR_MAP[yearCode]];
        timeVal = { value: GE_MONTH_MAP[monthCode], unit: TimeUnit.MONTH };
        rules.push("matched_GE");
      }
    }

    // LG
    const lgMatch = s.match(/^(\d)(\d{2})[A-Z0-9]+$/);
    if (lgMatch && !timeVal) {
      const digit = parseInt(lgMatch[1]);
      const lemma = parseInt(lgMatch[2]);
      const unit = lemma > 12 ? TimeUnit.WEEK : TimeUnit.MONTH;
      if (lemma >= 1 && lemma <= 53) {
        brand = "LG";
        candidates = [1990, 2000, 2010, 2020].map(dec => dec + digit);
        timeVal = { value: lemma, unit: unit };
        rules.push("matched_LG");
      }
    }

    // Samsung
    const saMatch = s.length === 15 ? s.match(/^[A-Z0-9]{7}([A-Z0-9])([1-9ABC])[A-Z0-9]{6}$/) : 
                    s.length === 11 ? s.match(/^[A-Z0-9]{3}([A-Z0-9])([1-9ABC])[A-Z0-9]{6}$/) : null;
    if (saMatch && !timeVal) {
      const yearCode = saMatch[1];
      const monthCode = saMatch[2];
      if (SAMSUNG_YEAR_MAP[yearCode] && SAMSUNG_MONTH_MAP[monthCode]) {
        brand = "Samsung";
        candidates = [...SAMSUNG_YEAR_MAP[yearCode]];
        timeVal = { value: SAMSUNG_MONTH_MAP[monthCode], unit: TimeUnit.MONTH };
        rules.push(`matched_Samsung_${s.length}`);
      }
    }

    // Bosch FD
    const bMatch = s.match(/^FD(\d{2})(\d{2})\d+$/);
    if (bMatch && !timeVal) {
      const fdYear = parseInt(bMatch[1]);
      const month = parseInt(bMatch[2]);
      if (month >= 1 && month <= 12) {
        brand = "Bosch";
        const decodedYY = (fdYear + 20) % 100;
        candidates = [1900, 2000].map(c => c + decodedYY);
        timeVal = { value: month, unit: TimeUnit.MONTH };
        rules.push("matched_Bosch_FD");
      }
    }

    // Alliance Residential
    const alMatch = s.match(/^(\d{2})(\d{2})\d+$/);
    if (alMatch && !timeVal) {
      const yy = parseInt(alMatch[1]);
      const mm = parseInt(alMatch[2]);
      if (mm >= 1 && mm <= 12) {
        brand = "Alliance";
        candidates = [1900, 2000].map(c => c + yy);
        timeVal = { value: mm, unit: TimeUnit.MONTH };
        rules.push("matched_Alliance_Res");
      }
    }

    const candidatesInitial = candidates.filter(y => y <= this.maxYear);
    let remaining = [...candidatesInitial];

    // --- 2. Hard Eliminators (Definitive Bounds) ---
    let anyHard = false;
    let evidenceHard = false;

    // Smart Features -> >= 2010
    const isSmart = [...feats].some(f => SMART_FEATURES.has(f));
    const isModernRefr = MODERN_REFRIGERANTS.has(refr);
    if (isSmart || isModernRefr) {
      const before = remaining.length;
      remaining = remaining.filter(y => y >= SMART_ERA_START);
      if (remaining.length < before) {
        rules.push(`hard_modern_features>=${SMART_ERA_START}`);
        evidenceHard = true;
        anyHard = true;
      }
    }

    // GE Modern Breaker -> >= 2012
    const isGEModern = brand === "GE" && [...feats].some(f => GE_MODERN_CUES.has(f));
    if (isGEModern) {
      const before = remaining.length;
      remaining = remaining.filter(y => y >= GE_MODERN_BREAKER_START);
      if (remaining.length < before) {
        rules.push(`hard_ge_modern>=${GE_MODERN_BREAKER_START}`);
        evidenceHard = true;
        anyHard = true;
      }
    }

    const candidatesAfterHard = [...remaining];

    // --- 3. Soft Scoring & Resolution ---
    let selectedYear: number | null = null;
    let confidence: "high" | "medium" | "low" = "low";
    let reason = "No candidates found";

    if (remaining.length === 0) {
      selectedYear = null;
      confidence = "low";
      reason = "Hard eliminators removed all possibilities";
    } else if (remaining.length === 1) {
      selectedYear = remaining[0];
      if (candidatesInitial.length === 1) {
        confidence = "high";
        reason = "Unique decoding result";
      } else if (evidenceHard) {
        confidence = "high";
        reason = "Ambiguity resolved via technical feature evidence";
      } else if (anyHard) {
        confidence = "medium";
        reason = "Ambiguity resolved via era-based eliminators";
      } else {
        confidence = "low";
        reason = "Singleton after filtering (review recommended)";
      }
    } else {
      // Multiple candidates: Use soft cues
      const newest = Math.max(...remaining);
      const oldest = Math.min(...remaining);
      
      let softUsed = false;
      if (REVISION_SUFFIXES.some(sfx => m.includes(sfx))) {
        selectedYear = newest;
        rules.push("soft_revision->newest");
        softUsed = true;
      } else if (feats.has("vintage_style")) {
        selectedYear = oldest;
        rules.push("soft_vintage->oldest");
        softUsed = true;
      } else {
        selectedYear = newest;
        rules.push("default->newest");
      }

      confidence = "low";
      reason = softUsed ? "Resolved via soft styling/revision cues" : "Resolved via default (newest) preference";
    }

    return {
      brandFamily: brand,
      serial: s,
      manufactureYear: selectedYear,
      timeValue: timeVal,
      confidence,
      resolutionReason: reason,
      candidatesInitial,
      remainingCandidates: candidatesAfterHard,
      rulesApplied: rules
    };
  }
}
