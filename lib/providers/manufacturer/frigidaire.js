import 'server-only';
import { fetchGenericManufacturerFamilyBom } from './generic-family';

export async function fetchFrigidaireManufacturerBom({ modelNumber, brand, family }) {
  return fetchGenericManufacturerFamilyBom({
    modelNumber,
    brand: brand || 'Frigidaire',
    truthSource: family?.label || 'Frigidaire / Electrolux family manufacturer catalog',
    manufacturerDomains: family?.domains || [
      'frigidaireapplianceparts.com',
      'electroluxapplianceparts.com',
      'frigidaire.com',
      'electrolux.com',
    ],
    strategy: 'manufacturer-family-generic',
  });
}
