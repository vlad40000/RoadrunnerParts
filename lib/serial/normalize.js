import 'server-only';

export function normalizeSerialNumber(serial) {
  if (!serial) return '';
  return String(serial)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, ''); // Remove spaces, hyphens, and non-alnum
}

export function stripSerialNoise(serial) {
  // Common noise patterns in extracted serials
  if (!serial) return '';
  return normalizeSerialNumber(serial)
    .replace(/^S\/N[:\s]*/i, '')
    .replace(/^SER[:\s]*/i, '')
    .replace(/^SERIAL[:\s]*/i, '');
}

export function normalizeBrandLabel(brand) {
  if (!brand) return 'Unknown';
  const b = String(brand).trim().toUpperCase();
  
  if (b.includes('GE APPLIANCES') || b === 'GE') return 'GE';
  if (b.includes('HOTPOINT')) return 'Hotpoint';
  if (b.includes('HAIER')) return 'Haier';
  if (b.includes('MONOGRAM')) return 'Monogram';
  if (b.includes('WHIRLPOOL')) return 'Whirlpool';
  if (b.includes('KITCHENAID')) return 'KitchenAid';
  if (b.includes('MAYTAG')) return 'Maytag';
  if (b.includes('AMANA')) return 'Amana';
  if (b.includes('FRIGIDAIRE')) return 'Frigidaire';
  if (b.includes('ELECTROLUX')) return 'Electrolux';
  if (b.includes('LG')) return 'LG';
  if (b.includes('SAMSUNG')) return 'Samsung';
  if (b.includes('BOSCH')) return 'Bosch';
  if (b.includes('THERMADOR')) return 'Thermador';
  if (b.includes('GAGGENAU')) return 'Gaggenau';
  if (b.includes('SPEED QUEEN')) return 'Speed Queen';
  if (b.includes('KENMORE')) return 'Kenmore';

  return brand.trim();
}
