import { sql } from '@/lib/db';

/**
 * Layer 3 — Canonical Model Resolution
 */

const BRAND_PREFIXES = {
  WH: 'GE', WE: 'GE', WR: 'GE', WD: 'GE', JB: 'GE', JT: 'GE',
  GTD: 'GE', GTW: 'GE', GFW: 'GE', GDF: 'GE', GDT: 'GE',
  PFQ: 'GE', PFD: 'GE', PDT: 'GE', PVD: 'GE',
  HPS: 'Hotpoint', HPE: 'Hotpoint', HDA: 'Hotpoint', HDF: 'Hotpoint', HTX: 'Hotpoint', HTW: 'Hotpoint',
  HRT: 'Hotpoint', HSS: 'Hotpoint', HPN: 'Hotpoint',
  RF: 'Samsung', DW: 'Samsung', WF: 'Samsung', WW: 'Samsung', DV: 'Samsung', WA: 'Samsung', NX: 'Samsung',
  MV: 'Maytag', MED: 'Maytag', MDB: 'Maytag', MHW: 'Maytag',
  WDT: 'Whirlpool', WTW: 'Whirlpool', WED: 'Whirlpool', WFW: 'Whirlpool', WRS: 'Whirlpool',
  WRF: 'Whirlpool', WRT: 'Whirlpool', WRF5: 'Whirlpool', KDT: 'KitchenAid', KDTE: 'KitchenAid',
  KDF: 'KitchenAid', KRFF: 'KitchenAid', KRFC: 'KitchenAid', JDB: 'Jenn-Air', JFC: 'Jenn-Air',
  LG: 'LG', LD: 'LG', WT: 'LG', WM: 'LG', DL: 'LG', LDF: 'LG', LMX: 'LG', LFX: 'LG',
  SHP: 'Bosch', SHE: 'Bosch', SHX: 'Bosch', SHV: 'Bosch', SGV: 'Bosch', B36: 'Bosch',
  EFM: 'Electrolux', EI: 'Electrolux', FF: 'Frigidaire', FG: 'Frigidaire', FDS: 'Frigidaire',
  FDB: 'Frigidaire', GL: 'Frigidaire', GLE: 'Frigidaire',
  LSW: 'Whirlpool', LSQ: 'Whirlpool',
};

const KENMORE_PREFIXES = {
  '106': 'Whirlpool',
  '110': 'Whirlpool',
  '596': 'Whirlpool',
  '665': 'Whirlpool',
  '253': 'Frigidaire',
  '417': 'Frigidaire',
  '587': 'Frigidaire',
  '790': 'Frigidaire',
  '363': 'GE',
  '362': 'GE',
  '911': 'GE',
  '795': 'LG',
  '796': 'LG',
  '401': 'Samsung',
  '592': 'Samsung',
};

function normalizeModelStr(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\/[A-Z0-9]{1,4}$/, '');
}

function guessBrandFromModel(canonicalModel) {
  const kenmoreMatch = canonicalModel.match(/^(\d{3})\./);
  if (kenmoreMatch) {
    const mapped = KENMORE_PREFIXES[kenmoreMatch[1]];
    if (mapped) return mapped;
  }
  const sorted = Object.keys(BRAND_PREFIXES).sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (canonicalModel.startsWith(prefix)) return BRAND_PREFIXES[prefix];
  }
  return null;
}

function extractFamilyRoot(canonicalModel) {
  const match = canonicalModel.match(/^([A-Z]{2,4}\d{2,4}[A-Z]{1,6})/);
  return match ? match[1] : canonicalModel.substring(0, Math.min(canonicalModel.length, 8));
}

export async function findResolution(rawModel) {
  const normalized = normalizeModelStr(rawModel);
  try {
    const rows = await sql`
      SELECT canonical_model, alternate_models, family_root, brand, ambiguity_score
      FROM model_resolution
      WHERE raw_model = ${normalized}
      LIMIT 1;
    `;
    return rows.length > 0 ? rows[0] : null;
  } catch (err) { return null; }
}

export async function resolveCanonicalModel(modelNumber) {
  const norm = normalizeModelStr(modelNumber);
  const brandFromPrefix = guessBrandFromModel(norm);

  if (brandFromPrefix) {
    return {
      canonicalModel: norm,
      alternates: [],
      familyRoot: extractFamilyRoot(norm),
      brand: brandFromPrefix,
      ambiguityScore: 0,
      source: 'deterministic',
    };
  }

  const existing = await findResolution(norm);
  if (existing) {
    return {
      canonicalModel: existing.canonical_model,
      alternates: existing.alternate_models || [],
      familyRoot: existing.family_root,
      brand: existing.brand,
      ambiguityScore: Number(existing.ambiguity_score) || 0,
      source: 'db',
    };
  }

  return {
    canonicalModel: norm,
    alternates: [],
    familyRoot: extractFamilyRoot(norm),
    brand: null,
    ambiguityScore: 0,
    source: 'unknown',
  };
}

export { normalizeModelStr, extractFamilyRoot };
