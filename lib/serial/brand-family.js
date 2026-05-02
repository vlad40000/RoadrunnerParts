import 'server-only';
import { normalizeBrandLabel } from './normalize.js';

export const DECODER_FAMILIES = {
  GE_FAMILY: 'GE_FAMILY',
  WHIRLPOOL_FAMILY: 'WHIRLPOOL_FAMILY',
  MAYTAG_LEGACY: 'MAYTAG_LEGACY',
  ELECTROLUX_FAMILY: 'ELECTROLUX_FAMILY',
  LG: 'LG',
  BOSCH_BSH: 'BOSCH_BSH',
  SAMSUNG: 'SAMSUNG',
  ALLIANCE: 'ALLIANCE',
  UNKNOWN: 'UNKNOWN',
};

export function resolveDecoderFamily(brand, modelNumber = '') {
  const normalizedBrand = normalizeBrandLabel(brand);
  const normModel = String(modelNumber || '').toUpperCase().trim();

  // GE Family
  if (['GE', 'Hotpoint', 'Haier', 'Monogram'].includes(normalizedBrand)) {
    return DECODER_FAMILIES.GE_FAMILY;
  }

  // Whirlpool Family
  if (['Whirlpool', 'KitchenAid', 'Amana', 'Roper', 'Estate', 'Admiral', 'Inglis', 'Jenn-Air'].includes(normalizedBrand)) {
    return DECODER_FAMILIES.WHIRLPOOL_FAMILY;
  }

  // Maytag
  if (normalizedBrand === 'Maytag') {
    // If it looks like a legacy Maytag (e.g., ends in letter month/year code), handle as legacy
    // This is a heuristic; most modern Maytag uses Whirlpool patterns
    if (normModel.match(/[A-Z]{2}\d{4}[A-Z]{2}$/)) {
      return DECODER_FAMILIES.MAYTAG_LEGACY;
    }
    return DECODER_FAMILIES.WHIRLPOOL_FAMILY;
  }

  // Electrolux Family
  if (['Frigidaire', 'Electrolux', 'Tappan', 'Kelvinator', 'Gibson'].includes(normalizedBrand)) {
    return DECODER_FAMILIES.ELECTROLUX_FAMILY;
  }

  // LG
  if (normalizedBrand === 'LG') {
    return DECODER_FAMILIES.LG;
  }

  // Bosch
  if (['Bosch', 'Thermador', 'Gaggenau'].includes(normalizedBrand)) {
    return DECODER_FAMILIES.BOSCH_BSH;
  }

  // Samsung
  if (normalizedBrand === 'Samsung') {
    return DECODER_FAMILIES.SAMSUNG;
  }

  // Alliance
  if (['Alliance', 'Speed Queen', 'Huebsch'].includes(normalizedBrand)) {
    return DECODER_FAMILIES.ALLIANCE;
  }

  // Kenmore OEM routing (heuristic based on model prefix)
  if (normalizedBrand === 'Kenmore' || normModel.includes('.')) {
    const prefix = normModel.split('.')[0];
    const kenmoreOem = {
      '106': DECODER_FAMILIES.WHIRLPOOL_FAMILY,
      '110': DECODER_FAMILIES.WHIRLPOOL_FAMILY,
      '665': DECODER_FAMILIES.WHIRLPOOL_FAMILY,
      '587': DECODER_FAMILIES.ELECTROLUX_FAMILY,
      '253': DECODER_FAMILIES.ELECTROLUX_FAMILY,
      '417': DECODER_FAMILIES.ELECTROLUX_FAMILY,
      '795': DECODER_FAMILIES.LG,
      '796': DECODER_FAMILIES.LG,
      '401': DECODER_FAMILIES.SAMSUNG,
      '592': DECODER_FAMILIES.SAMSUNG,
      '363': DECODER_FAMILIES.GE_FAMILY,
      '362': DECODER_FAMILIES.GE_FAMILY,
      '911': DECODER_FAMILIES.GE_FAMILY,
    }[prefix];
    if (kenmoreOem) return kenmoreOem;
  }

  return DECODER_FAMILIES.UNKNOWN;
}
