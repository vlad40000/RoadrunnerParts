import 'server-only';

import { sql } from '../../../server/db';

type PriceRow = {
  part_number: string;
  source: string | null;
  price: string | number | null;
  currency: string | null;
  availability: string | null;
  price_url: string | null;
  captured_at: string | Date | null;
};

type PriceSnapshot = {
  source: string;
  supplier: string;
  price: number;
  currency: string;
  availability: string | null;
  priceUrl: string | null;
  capturedAt: string | null;
  rank: number;
};

const SUPPLIER_PRIORITY = [
  {
    supplier: 'encompass',
    aliases: ['encompass', 'encompass.com'],
  },
  {
    supplier: 'reliableparts',
    aliases: ['reliableparts', 'reliable parts', 'reliableparts.com'],
  },
  {
    supplier: 'dlparts',
    aliases: ['dlparts', 'd&lparts', 'd&l parts', 'd and l parts', 'dandlparts', 'dnlparts'],
  },
  {
    supplier: 'searspartsdirect',
    aliases: ['searspartsdirect', 'sears partsdirect', 'sears parts direct', 'searspartsdirect.com'],
  },
  {
    supplier: 'partsdr',
    aliases: ['partsdr', 'parts dr', 'partsdr.com'],
  },
  {
    supplier: 'partselect',
    aliases: ['partselect', 'partselect.com'],
  },
  {
    supplier: 'appliancepartspros',
    aliases: ['appliancepartspros', 'appliance parts pros', 'appliancepartspros.com'],
  },
  {
    supplier: 'repairclinic',
    aliases: ['repairclinic', 'repair clinic', 'repairclinic.com'],
  },
  {
    supplier: 'fix',
    aliases: ['fix.com', 'fix'],
  },
  {
    supplier: 'ebay',
    aliases: ['ebay', 'ebay.com'],
  },
] as const;

function normalizeModel(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function normalizePartNumber(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function normalizeSource(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./g, '')
    .replace(/[^a-z0-9&.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function supplierForSource(source: unknown) {
  const normalized = normalizeSource(source);
  for (let index = 0; index < SUPPLIER_PRIORITY.length; index += 1) {
    const candidate = SUPPLIER_PRIORITY[index];
    if (candidate.aliases.some((alias) => normalized.includes(alias))) {
      return { supplier: candidate.supplier, rank: index };
    }
  }
  return { supplier: normalized || 'unknown', rank: 999 };
}

function toPositivePrice(value: unknown) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function toIsoString(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

function pickBetterPrice(existing: PriceSnapshot | undefined, candidate: PriceSnapshot) {
  if (!existing) return candidate;

  if (candidate.rank !== existing.rank) {
    return candidate.rank < existing.rank ? candidate : existing;
  }

  const existingTime = existing.capturedAt ? Date.parse(existing.capturedAt) || 0 : 0;
  const candidateTime = candidate.capturedAt ? Date.parse(candidate.capturedAt) || 0 : 0;
  if (candidateTime !== existingTime) {
    return candidateTime > existingTime ? candidate : existing;
  }

  // Same supplier/rank/date: keep the lower positive price as the practical listing baseline.
  return candidate.price < existing.price ? candidate : existing;
}

export async function hydrateBomPricesFromDb<T extends Record<string, any>>(input: {
  model: string;
  parts: T[];
}): Promise<T[]> {
  const normalizedModel = normalizeModel(input.model);
  if (!normalizedModel || input.parts.length === 0) return input.parts;

  const partNumbers = Array.from(
    new Set(input.parts.map((part) => normalizePartNumber(part.partNumber)).filter(Boolean)),
  );
  if (partNumbers.length === 0) return input.parts;

  const rows = (await sql`
    select
      upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) as part_number,
      pp.source,
      pp.price,
      pp.currency,
      pp.availability,
      pp.price_url,
      pp.captured_at
    from part_pricing pp
    join appliance_models am on am.id = pp.model_id
    where am.normalized_model = ${normalizedModel}
      and upper(regexp_replace(pp.part_number, '[^A-Z0-9]', '', 'g')) = any(${partNumbers})
      and pp.price is not null
      and pp.price > 0
  `) as PriceRow[];

  const priceByPart = new Map<string, PriceSnapshot>();

  for (const row of rows) {
    const partNumber = normalizePartNumber(row.part_number);
    const price = toPositivePrice(row.price);
    if (!partNumber || price === null) continue;

    const supplier = supplierForSource(row.source || row.price_url);
    const snapshot: PriceSnapshot = {
      source: row.source || supplier.supplier,
      supplier: supplier.supplier,
      price,
      currency: row.currency || 'USD',
      availability: row.availability,
      priceUrl: row.price_url,
      capturedAt: toIsoString(row.captured_at),
      rank: supplier.rank,
    };

    priceByPart.set(partNumber, pickBetterPrice(priceByPart.get(partNumber), snapshot));
  }

  return input.parts.map((part) => {
    const partNumber = normalizePartNumber(part.partNumber);
    const dbPrice = priceByPart.get(partNumber);

    if (!dbPrice) {
      const existingPrice = toPositivePrice(part.price);
      return {
        ...part,
        price: existingPrice,
        priceVerified: Boolean(part.priceVerified && existingPrice !== null),
        priceRetrievalState: existingPrice !== null ? 'model_supplied_price_needs_supplier_verification' : 'supplier_price_missing',
        pricingRequired: true,
      };
    }

    return {
      ...part,
      price: dbPrice.price,
      priceSource: dbPrice.supplier,
      priceSupplier: dbPrice.supplier,
      priceVerified: true,
      priceCurrency: dbPrice.currency,
      priceAvailability: dbPrice.availability,
      priceUrl: dbPrice.priceUrl,
      priceCheckedAt: dbPrice.capturedAt,
      priceRetrievalState: 'priced_from_supplier_db',
      pricingRequired: false,
    };
  });
}

export function buildPricingSummary(parts: Array<Record<string, any>>) {
  const total = parts.length;
  const priced = parts.filter((part) => part.priceVerified && Number(part.price) > 0).length;
  const missing = Math.max(0, total - priced);

  return {
    total,
    priced,
    missing,
    pricingComplete: total > 0 && missing === 0,
    pricingCoverage: total > 0 ? Number((priced / total).toFixed(4)) : 0,
    prioritySuppliers: SUPPLIER_PRIORITY.map((entry) => entry.supplier),
  };
}
