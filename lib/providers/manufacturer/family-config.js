import 'server-only';

export const KENMORE_OEM_MAP = {
  '106': 'Whirlpool',
  '110': 'Whirlpool',
  '665': 'Whirlpool',
  '587': 'Frigidaire',
  '253': 'Frigidaire',
  '417': 'Frigidaire',
  '795': 'LG',
  '796': 'LG',
  '401': 'Samsung',
  '592': 'Samsung',
  '363': 'GE',
  '362': 'GE',
  '911': 'GE',
  '596': 'Whirlpool',
  '790': 'Frigidaire',
};

const BRAND_ALIASES = {
  'GE PROFILE': 'GE',
  PROFILE: 'GE',
  CAFE: 'GE',
  'CAFÉ': 'GE',
  MONOGRAM: 'Monogram',
  HOTPOINT: 'Hotpoint',
  HAIER: 'Haier',
  ELECTROLUX: 'Electrolux',
  FRIGIDAIRE: 'Frigidaire',
  KITCHENAID: 'KitchenAid',
  'JENN-AIR': 'Jenn-Air',
  JENNAIR: 'Jenn-Air',
  BOSCH: 'Bosch',
  THERMADOR: 'Thermador',
  GAGGENAU: 'Gaggenau',
  HISENSE: 'Hisense',
  LG: 'LG',
  SAMSUNG: 'Samsung',
  WHIRLPOOL: 'Whirlpool',
  MAYTAG: 'Maytag',
  AMANA: 'Amana',
  KENMORE: 'Kenmore',
};


export const MANUFACTURER_FAMILIES = [
  {
    key: 'ge-family',
    family: 'GE',
    label: 'GE Appliances family manufacturer catalog',
    brands: ['GE', 'Hotpoint', 'Haier', 'Monogram'],
    domains: ['geapplianceparts.com', 'geappliances.com'],
    adapterKey: 'ge-official',
  },
  {
    key: 'whirlpool-family',
    family: 'Whirlpool',
    label: 'Whirlpool family manufacturer catalog',
    brands: ['Whirlpool', 'Maytag', 'KitchenAid', 'Amana', 'Jenn-Air', 'Roper', 'Estate', 'Inglis', 'Admiral'],
    domains: ['whirlpoolparts.com', 'whirlpool.com', 'maytag.com', 'kitchenaid.com', 'amana.com', 'jennair.com'],
    adapterKey: 'whirlpool-family',
  },
  {
    key: 'frigidaire-family',
    family: 'Frigidaire',
    label: 'Frigidaire / Electrolux family manufacturer catalog',
    brands: ['Frigidaire', 'Electrolux', 'Tappan', 'Kelvinator', 'Gibson'],
    domains: ['frigidaireapplianceparts.com', 'electroluxapplianceparts.com', 'frigidaire.com', 'electrolux.com'],
    adapterKey: 'frigidaire-family',
  },
  {
    key: 'lg-family',
    family: 'LG',
    label: 'LG manufacturer catalog',
    brands: ['LG'],
    domains: ['lgparts.com', 'lg.com'],
    adapterKey: 'lg-family',
  },
  {
    key: 'samsung-family',
    family: 'Samsung',
    label: 'Samsung manufacturer catalog',
    brands: ['Samsung'],
    domains: ['samsungparts.com', 'samsung.com'],
    adapterKey: 'samsung-family',
  },
  {
    key: 'bsh-family',
    family: 'Bosch',
    label: 'BSH family manufacturer catalog',
    brands: ['Bosch', 'Thermador', 'Gaggenau'],
    domains: ['bosch-home.com', 'thermador.com', 'gaggenau.com'],
    adapterKey: 'bosch-family',
  },
  {
    key: 'hisense-family',
    family: 'Hisense',
    label: 'Hisense authorized Encompass parts surface',
    brands: ['Hisense'],
    domains: ['hisense.encompass.com', 'shop.hisense-usa.com', 'hisense-usa.com'],
    adapterKey: 'hisense-family',
  },
];

export function resolveTrueOemBrand(brand, modelNumber = '') {
  const normalizedBrand = String(brand || '').trim().toUpperCase();
  const aliasedBrand = BRAND_ALIASES[normalizedBrand] || String(brand || '').trim();

  if (aliasedBrand === 'Kenmore' || (!aliasedBrand && String(modelNumber).includes('.'))) {
    const prefix = String(modelNumber).split('.')[0];
    const mapped = KENMORE_OEM_MAP[prefix];
    if (mapped) return mapped;
  }
  return aliasedBrand || 'Unknown';
}

export function getManufacturerFamilyConfig(brand, modelNumber = '') {
  const resolvedBrand = resolveTrueOemBrand(brand, modelNumber);
  return MANUFACTURER_FAMILIES.find((family) => family.brands.includes(resolvedBrand)) || null;
}
