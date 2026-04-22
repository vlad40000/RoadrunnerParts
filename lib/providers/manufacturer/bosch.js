import 'server-only';
import { fetchGenericManufacturerFamilyBom } from './generic-family';

export async function fetchBoschManufacturerBom({ modelNumber, brand, family }) {
  const domains = family?.domains || ['bosch-home.com', 'thermador.com', 'gaggenau.com'];
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Bosch',
    truthSource: family?.label || 'BSH family manufacturer catalog',
    manufacturerDomains: domains,
    strategy: 'manufacturer-family-generic',
  });
}
