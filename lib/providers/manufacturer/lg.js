import 'server-only';
import { fetchGenericManufacturerFamilyBom } from './generic-family';

export async function fetchLgManufacturerBom({ modelNumber, brand, family }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'LG',
    truthSource: family?.label || 'LG manufacturer catalog',
    manufacturerDomains: family?.domains || ['lgparts.com', 'lg.com'],
    strategy: 'manufacturer-family-generic',
  });
}
