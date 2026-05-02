import 'server-only';
import { fetchGenericManufacturerFamilyBom } from './generic-family';

/**
 * Whirlpool Family Adapter (Whirlpool, Maytag, KitchenAid, Amana, Jenn-Air).
 */
export async function fetchWhirlpoolManufacturerBom({ modelNumber, brand }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Whirlpool',
    truthSource: 'Whirlpool family manufacturer catalog',
    manufacturerDomains: [
      'whirlpoolparts.com',
      'whirlpool.com',
      'maytag.com',
      'kitchenaid.com',
      'amana.com',
      'jennair.com',
    ],
    strategy: 'manufacturer-family-generic',
  });
}

/**
 * LG Official Adapter.
 */
export async function fetchLgManufacturerBom({ modelNumber }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: 'LG',
    truthSource: 'LG manufacturer catalog',
    manufacturerDomains: [
      'lgparts.com',
      'lg.com',
    ],
    strategy: 'manufacturer-family-generic',
  });
}

/**
 * Samsung Official Adapter.
 */
export async function fetchSamsungManufacturerBom({ modelNumber }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: 'Samsung',
    truthSource: 'Samsung manufacturer catalog',
    manufacturerDomains: [
      'samsungparts.com',
      'samsung.com',
    ],
    strategy: 'manufacturer-family-generic',
  });
}

/**
 * Frigidaire Family Adapter (Frigidaire, Electrolux, Tappan, Kelvinator).
 */
export async function fetchFrigidaireManufacturerBom({ modelNumber, brand }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Frigidaire',
    truthSource: 'Frigidaire / Electrolux family manufacturer catalog',
    manufacturerDomains: [
      'frigidaireapplianceparts.com',
      'electroluxapplianceparts.com',
      'frigidaire.com',
      'electrolux.com',
    ],
    strategy: 'manufacturer-family-generic',
  });
}

/**
 * Bosch Family Adapter (BSH Family).
 */
export async function fetchBoschManufacturerBom({ modelNumber, brand }) {
  const domains = ['bosch-home.com'];
  if (brand === 'Thermador') {
    domains.unshift('thermador.com');
  }
  if (brand === 'Gaggenau') {
    domains.unshift('gaggenau.com');
  }

  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Bosch',
    truthSource: 'BSH family manufacturer catalog',
    manufacturerDomains: domains,
    strategy: 'manufacturer-family-generic',
  });
}
