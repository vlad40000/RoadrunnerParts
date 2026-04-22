import 'server-only';
import { fetchGenericManufacturerFamilyBom } from './generic-family';

export async function fetchSamsungManufacturerBom({ modelNumber, brand, family }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Samsung',
    truthSource: family?.label || 'Samsung manufacturer catalog',
    manufacturerDomains: family?.domains || ['samsungparts.com', 'samsung.com'],
    strategy: 'manufacturer-family-generic',
  });
}
