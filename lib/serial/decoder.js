import 'server-only';
import { normalizeSerialNumber, stripSerialNoise } from './normalize';
import { resolveDecoderFamily, DECODER_FAMILIES } from './brand-family';

// --- Constants & Rulesets ---

const GE_MONTH_MAP = {
  A: 1, B: 2, D: 3, F: 4, G: 5, H: 6, L: 7, M: 8, R: 9, S: 10, T: 11, V: 12
};

const GE_YEAR_MAP = {
  A: [2001, 2013, 2025], D: [2002, 2014, 2026], F: [2003, 2015], G: [2004, 2016],
  H: [2005, 2017], L: [2006, 2018], M: [2007, 2019], R: [2008, 2020],
  S: [2009, 2021], T: [2010, 2022], V: [2011, 2023], Z: [2012, 2024]
};

const WHIRLPOOL_YEAR_MAP = {
  L: [2001, 2021], M: [2002, 2022], P: [2003, 2023], R: [2004, 2024], S: [2005, 2025], 
  T: [2006, 2026], U: [2007, 2027], W: [2008], X: [2009], Y: [2010],
  A: [2011], B: [2012], C: [2013], D: [2014], E: [2015], F: [2016],
  G: [2017], H: [2018], J: [2019], K: [2020],
  '0': [2010], '1': [2011], '2': [2012, 2022], '3': [2013, 2023], '4': [2014, 2024],
  '5': [2015, 2025], '6': [2016, 2026], '7': [2017, 2027], '8': [2018], '9': [2019]
};

const MAYTAG_YEAR_MAP = {
  A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
  J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, Q: 1994, R: 1995,
  S: 1996, T: 1997, U: 1998, V: 1999, W: 2000, X: 2001, Y: 2002, Z: 2003,
  'A2': 2004, 'B2': 2005, 'C2': 2006
};

const MAYTAG_MONTH_MAP = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 9, K: 10, L: 11, M: 12
};

const SAMSUNG_YEAR_MAP = {
  R: 2001, T: 2002, W: 2003, X: 2004, Y: 2005, L: 2006, P: 2007, Q: 2008,
  S: 2009, Z: 2010, B: 2011, C: 2012, D: 2013, F: 2014, G: 2015, H: 2016,
  J: 2017, K: 2018, M: 2019, N: 2020, R2: 2021, T2: 2022, W2: 2023, X2: 2024
};

const SAMSUNG_MONTH_MAP = {
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 10, B: 11, C: 12
};

const SMART_ERA_START = 2010;
const GE_MODERN_BREAKER_START = 2012;
const BOSCH_FD_MIN_YEAR = 1984;
const ALLIANCE_RES_START = 1990;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

const SMART_FEATURES = ['wifi', 'smartthings', 'thinq', 'homeconnect', 'bluetooth'];
const REVISION_SUFFIXES = ['/AA', '/02', 'REV', 'VER', 'V2'];

// --- Helper Functions ---

function getCandidateDecades(yearDigit) {
  const digit = parseInt(yearDigit, 10);
  if (isNaN(digit)) return [];
  return [1990 + digit, 2000 + digit, 2010 + digit, 2020 + digit].filter(y => y <= MAX_YEAR);
}

function resolveConfidence(candidates, hardEliminatorsApplied, source) {
  if (candidates.length === 0) return 'low';
  if (source === 'BOSCH_BSH' && candidates.length === 1) return 'high';
  if (candidates.length === 1 && hardEliminatorsApplied) return 'high';
  if (candidates.length === 1) return 'medium'; // Unique but no extra evidence
  return 'low';
}

/**
 * Core Serial Decoder
 */
export async function decodeSerialNumber(inputSerial, options = {}) {
  const { 
    brand, 
    model, 
    hard_lower_bound_year, 
    observed_features = [], 
    refrigerant_label 
  } = options;

  const normalized = stripSerialNoise(inputSerial);
  const brandFamily = resolveDecoderFamily(brand, model);
  
  const result = {
    brandFamily,
    serial: normalized,
    candidatesBefore: [],
    remainingCandidates: [],
    selectedYear: null,
    timeValue: null,
    confidence: 'low',
    resolutionReason: '',
    rulesApplied: [],
    decoded: { month: null, week: null, year: null }
  };

  if (!normalized || brandFamily === DECODER_FAMILIES.UNKNOWN) {
    result.resolutionReason = "Missing serial or unknown brand family";
    return result;
  }

  // --- 1. Family-Specific Waterfall ---
  let rawCandidates = [];
  let month = null;
  let week = null;

  try {
    switch (brandFamily) {
      case DECODER_FAMILIES.GE_FAMILY: {
        const match = normalized.match(/^([A-TV])([A-Z])\d{6}/);
        if (match) {
          month = GE_MONTH_MAP[match[1]];
          rawCandidates = GE_YEAR_MAP[match[2]] || [];
          result.timeValue = { unit: 'month', value: month };
        }
        break;
      }

      case DECODER_FAMILIES.WHIRLPOOL_FAMILY: {
        const match = normalized.match(/^[A-Z]([A-Z0-9])(\d{2})\d{5}/);
        if (match) {
          const yearCode = match[1];
          const weekNum = parseInt(match[2], 10);
          if (weekNum >= 1 && weekNum <= 53) {
            week = weekNum;
            rawCandidates = WHIRLPOOL_YEAR_MAP[yearCode] || [];
            result.timeValue = { unit: 'week', value: week };
          }
        }
        break;
      }

      case DECODER_FAMILIES.MAYTAG_LEGACY: {
        const match = normalized.match(/.*([A-M])([A-Y2])$/); // Legacy suffix
        if (match) {
          month = MAYTAG_MONTH_MAP[match[1]];
          const yearCode = match[2];
          const y = MAYTAG_YEAR_MAP[yearCode];
          if (y) rawCandidates = [y];
          result.timeValue = { unit: 'month', value: month };
        }
        break;
      }

      case DECODER_FAMILIES.ELECTROLUX_FAMILY: {
        const match = normalized.match(/^[A-Z0-9]{2}(\d)(\d{2})\d{5}/);
        if (match) {
          const weekNum = parseInt(match[2], 10);
          if (weekNum >= 1 && weekNum <= 53) {
            week = weekNum;
            rawCandidates = getCandidateDecades(match[1]);
            result.timeValue = { unit: 'week', value: week };
          }
        }
        break;
      }

      case DECODER_FAMILIES.LG: {
        const match = normalized.match(/^(\d)(\d{2})[A-Z0-9]+/);
        if (match) {
          rawCandidates = getCandidateDecades(match[1]);
          const variant = parseInt(match[2], 10);
          if (variant >= 1 && variant <= 12) {
            month = variant;
            result.timeValue = { unit: 'month', value: month };
          } else if (variant >= 1 && variant <= 53) {
            week = variant;
            result.timeValue = { unit: 'week', value: week };
          }
        }
        break;
      }

      case DECODER_FAMILIES.BOSCH_BSH: {
        const match = normalized.match(/^FD(\d{2})(\d{2})\d+/);
        if (match) {
          const fdYY = parseInt(match[1], 10);
          const fdMM = parseInt(match[2], 10);
          if (fdMM >= 1 && fdMM <= 12) {
            month = fdMM;
            const baseYear = (fdYY + 20);
            const candidates = [1900 + baseYear, 2000 + baseYear].filter(y => y >= BOSCH_FD_MIN_YEAR && y <= MAX_YEAR);
            rawCandidates = candidates;
            result.timeValue = { unit: 'month', value: month };
          }
        }
        break;
      }

      case DECODER_FAMILIES.SAMSUNG: {
        // 15-char then 11-char fallback
        let sm = normalized.match(/^[A-Z0-9]{7}([A-Z0-9])([1-9ABC])/);
        if (!sm) sm = normalized.match(/^[A-Z0-9]{3}([A-Z0-9])([1-9ABC])/);
        
        if (sm) {
          const yCode = sm[1];
          const mCode = sm[2];
          const y = SAMSUNG_YEAR_MAP[yCode];
          month = SAMSUNG_MONTH_MAP[mCode];
          if (y) rawCandidates = [y];
          if (month) result.timeValue = { unit: 'month', value: month };
        }
        break;
      }

      case DECODER_FAMILIES.ALLIANCE: {
        const match = normalized.match(/^(\d{2})(\d{2})\d+/);
        if (match) {
          const yy = parseInt(match[1], 10);
          const mm = parseInt(match[2], 10);
          if (mm >= 1 && mm <= 12) {
            month = mm;
            const y = (yy < 50 ? 2000 : 1900) + yy;
            if (y >= ALLIANCE_RES_START && y <= MAX_YEAR) {
              rawCandidates = [y];
              result.timeValue = { unit: 'month', value: month };
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    result.resolutionReason = `Decoder error: ${err.message}`;
    return result;
  }

  result.candidatesBefore = [...rawCandidates];

  // --- 2. Hard Eliminators ---
  let filtered = [...rawCandidates];
  const filters = [];

  if (hard_lower_bound_year) {
    const prev = filtered.length;
    filtered = filtered.filter(y => y >= hard_lower_bound_year);
    if (filtered.length < prev) filters.push('hard_lower_bound_year');
  }

  const hasSmart = observed_features.some(f => SMART_FEATURES.includes(f.toLowerCase()));
  if (hasSmart) {
    const prev = filtered.length;
    filtered = filtered.filter(y => y >= SMART_ERA_START);
    if (filtered.length < prev) filters.push('smart_features_floor');
  }

  if (refrigerant_label === 'R600A') {
    const prev = filtered.length;
    filtered = filtered.filter(y => y >= SMART_ERA_START);
    if (filtered.length < prev) filters.push('modern_refrigerant_floor');
  }

  const isModernGE = brandFamily === DECODER_FAMILIES.GE_FAMILY && 
    observed_features.some(f => ['qr_code', 'url_printed', 'slate_finish'].includes(f.toLowerCase()));
  
  if (isModernGE) {
    const prev = filtered.length;
    filtered = filtered.filter(y => y >= GE_MODERN_BREAKER_START);
    if (filtered.length < prev) filters.push('ge_modern_breaker');
  }

  result.remainingCandidates = filtered;
  result.rulesApplied = filters;

  if (filtered.length === 0) {
    result.selectedYear = null;
    result.confidence = 'low';
    result.resolutionReason = rawCandidates.length > 0 ? "Hard eliminators removed all candidates" : "Pattern match failed or invalid codes";
    return result;
  }

  // --- 3. Soft Cues & Selection ---
  let selected = null;
  const cues = [];

  // Heuristic: newest is default
  selected = Math.max(...filtered);
  // console.log(`[DEBUG] Initial selection (max): ${selected} from ${filtered.join(',')}`);

  const hasNewCue = observed_features.some(f => ['qr_code', 'url_printed', 'modern_style'].includes(f.toLowerCase()));
  const hasOldCue = observed_features.includes('vintage_style');
  const hasRevision = REVISION_SUFFIXES.some(s => model?.toUpperCase().includes(s));

  if (hasOldCue) {
    selected = Math.min(...filtered);
    cues.push('vintage_style_bias');
  } else {
    selected = Math.max(...filtered);
    if (hasNewCue || hasRevision) {
      cues.push('modern_style_bias');
    }
    
    // Cyclic preference logic: if newest is "too new" and previous cycle exists
    if (filtered.length > 1) {
      const sorted = [...filtered].sort((a,b) => b - a);
      const newest = sorted[0];
      const previous = sorted[1];
      
      // If newest is current year or future and previous is in last 15 years, prefer previous
      if (newest >= (CURRENT_YEAR - 1) && previous >= (CURRENT_YEAR - 15)) {
        selected = previous;
        cues.push('cyclic_plausibility_preference');
      }
    }
  }

  result.selectedYear = selected;
  result.decoded = { year: selected, month, week };
  result.confidence = resolveConfidence(filtered, filters.length > 0, brandFamily);
  result.resolutionReason = cues.length > 0 ? `Resolved via ${cues.join(', ')}` : "Singleton or default newest selection";

  return result;
}
