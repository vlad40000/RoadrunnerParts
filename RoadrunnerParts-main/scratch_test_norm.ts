const APPROVED_PRICE_SOURCES = [
  'encompass.com',
  'searspartsdirect.com',
  'fix.com',
] as const;

function normalizePriceSource(value: unknown) {
  const source = String(value || '').trim().toLowerCase();
  return APPROVED_PRICE_SOURCES.find((approved) => source.includes(approved)) || '';
}

function normalizeGeneratedParts(parts: any[] | null | undefined) {
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

const mockParts = [
  {
    description: "Suspicious Part",
    price: 99.99,
    priceSource: "https://www.immigrationadvocates.org"
  }
];

const result = normalizeGeneratedParts(mockParts);
console.log('Result:', JSON.stringify(result, null, 2));
