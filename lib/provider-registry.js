import 'server-only';
import { normalizeModelNumber } from '@/lib/normalize';
import { 
  getManufacturerFamilyConfig, 
  resolveTrueOemBrand, 
  MANUFACTURER_FAMILIES 
} from '@/lib/providers/manufacturer/family-config';

const PRIMARY_DISTRIBUTORS = [
  'dlpartsco.com',
  'searspartsdirect.com'
];

const SECONDARY_DISTRIBUTORS = [
  'partselect.com',
  'repairclinic.com',
  'reliableparts.com',
];


function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sliceDomains(domains, maxCount) {
  return Array.isArray(domains) ? domains.slice(0, Math.max(0, maxCount)) : [];
}

export function buildProviderPlan({ modelNumber, brand, exhaustiveMode = false }) {
  const normalizedModel = normalizeModelNumber(modelNumber);
  const resolvedBrand = resolveTrueOemBrand(brand, modelNumber);
  const family = getManufacturerFamilyConfig(resolvedBrand, normalizedModel);

  const manufacturerDomains = family?.domains || [];

  const fastPrimaryMax = toPositiveInt(process.env.MAX_PRIMARY_FALLBACK_DOMAINS, 1);
  const fastSecondaryMax = toPositiveInt(process.env.MAX_SECONDARY_FALLBACK_DOMAINS, 1);

  const primaryDistributorDomains = exhaustiveMode
    ? [...PRIMARY_DISTRIBUTORS]
    : sliceDomains(PRIMARY_DISTRIBUTORS, fastPrimaryMax);

  const secondaryDistributorDomains = exhaustiveMode
    ? [...SECONDARY_DISTRIBUTORS]
    : sliceDomains(SECONDARY_DISTRIBUTORS, fastSecondaryMax);

  const distributorFallbacks = [
    ...PRIMARY_DISTRIBUTORS,
    ...SECONDARY_DISTRIBUTORS,
  ];

  const activeDistributorDomains = [
    ...primaryDistributorDomains,
    ...secondaryDistributorDomains,
  ];

  const allowedDomains = [...manufacturerDomains, ...activeDistributorDomains];
  const truthOrder = [...manufacturerDomains, ...activeDistributorDomains];

  return {
    normalizedModel,
    brand: resolvedBrand,
    truthSource: family?.label || `${resolvedBrand || 'Unknown'} manufacturer website`,
    strategy: family ? 'manufacturer-first-platform' : 'distributor-fallback',
    manufacturerDomains,
    distributorFallbacks,
    primaryDistributorDomains,
    secondaryDistributorDomains,
    allowedDomains,
    truthOrder,
    adapterKey: family?.adapterKey || null,
    familyKey: family?.key || null,
    minRawRows: Number(process.env.MANUFACTURER_MIN_RAW_ROWS || 12),
    exhaustiveMode: Boolean(exhaustiveMode),
  };
}

export function isManufacturerDomain(domain) {
  const normalized = String(domain || '').trim().toLowerCase();
  return MANUFACTURER_FAMILIES.some((family) =>
    (family.domains || []).some((manufacturerDomain) => normalized.includes(manufacturerDomain))
  );
}
