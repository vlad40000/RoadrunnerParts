export const APPROVED_PRICE_SOURCES = [
  'encompass.com',
  'searspartsdirect.com',
  'fix.com',
] as const; 

export function normalizePriceSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return APPROVED_PRICE_SOURCES.find((approved) => {
    const regex = new RegExp(`(^|\\.)` + approved.replace('.', '\\.') + `($|/|\\?|#|$)`, 'i');
    return regex.test(source);
  }) || '';
}

/**
 * Normalizes brand labels for consistent matching and slug generation.
 */
export function normalizeBrandLabel(brand: string | null | undefined): string {
  if (!brand) return '';
  return brand.trim().toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/\s+appliances?$/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes serial numbers: removes non-alphanumeric chars, keeps uppercase.
 */
export function normalizeSerialNumber(serial: string | null | undefined): string {
  if (!serial) return '';
  return serial.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalizes model numbers: standardizes for cache and search.
 */
export function normalizeModel(model: string | null | undefined): string {
  if (!model) return '';
  return model.trim().toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export const BRAND_SLUG_MAP: Record<string, string> = {
  'ge': 'general-electric',
  'general electric': 'general-electric',
  'whirlpool': 'whirlpool',
  'maytag': 'maytag',
  'kenmore': 'kenmore',
  'frigidaire': 'frigidaire',
  'lg': 'lg',
  'samsung': 'samsung',
  'bosch': 'bosch',
  'kitchenaid': 'kitchenaid',
  'amana': 'amana',
  'jennair': 'jennair',
  'hotpoint': 'hotpoint',
};

export const APPLIANCE_SLUG_MAP: Record<string, string> = {
  'washer': 'washer',
  'washing machine': 'washer',
  'dryer': 'dryer',
  'dishwasher': 'dishwasher',
  'refrigerator': 'refrigerator',
  'fridge': 'refrigerator',
  'range': 'range',
  'stove': 'range',
  'oven': 'range',
  'microwave': 'microwave',
};

export function getFixBrandSlug(brand: string): string {
  const normalized = normalizeBrandLabel(brand);
  return BRAND_SLUG_MAP[normalized] || normalized.replace(/\s+/g, '-');
}

export function getFixApplianceSlug(type: string): string {
  const t = type.toLowerCase();
  for (const [key, val] of Object.entries(APPLIANCE_SLUG_MAP)) {
    if (t.includes(key)) return val;
  }
  return 'appliance';
}

export function normalizeGeneratedParts(parts: any[] | null | undefined) {
  if (!Array.isArray(parts)) return [];

  return parts.flatMap((part) => {
    if (!part || typeof part !== 'object') return [];

    const price = Number(part.price);
    const priceSource = normalizePriceSource(part.priceSource);
    if (!Number.isFinite(price) || price <= 0 || !priceSource) {
      return [];
    }

    return [{
      ...part,
      price,
      priceSource,
    }];
  });
}

export function hasInvalidMarketPrices(parts: any[] | null | undefined) {
  if (!Array.isArray(parts)) return true;
  if (parts.length === 0) return false;
  return parts.some((p) => !p.price || p.price <= 0 || !normalizePriceSource(p.priceSource));
}

/**
 * Backward-compatible concurrency helper used by older BOM orchestrator code.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const active = new Set<Promise<R>>();
  const max = Math.max(1, Number(limit) || 1);

  for (const item of items) {
    if (active.size >= max) {
      await Promise.race(active);
    }

    const promise = fn(item).then((res) => {
      active.delete(promise);
      return res;
    });

    active.add(promise);
    results.push(promise);
  }

  return Promise.all(results);
}
