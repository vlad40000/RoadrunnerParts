import 'server-only';
import { fetchGeManufacturerBom } from './ge';
import { fetchWhirlpoolManufacturerBom } from './whirlpool';
import { fetchLgManufacturerBom } from './lg';
import { fetchSamsungManufacturerBom } from './samsung';
import { fetchFrigidaireManufacturerBom } from './frigidaire';
import { fetchBoschManufacturerBom } from './bosch';
import { EMPTY_BOM_RESULT } from './base';
import { getManufacturerFamilyConfig, resolveTrueOemBrand } from './family-config';

const ADAPTERS = {
  'ge-official': fetchGeManufacturerBom,
  'whirlpool-family': fetchWhirlpoolManufacturerBom,
  'frigidaire-family': fetchFrigidaireManufacturerBom,
  'lg-family': fetchLgManufacturerBom,
  'samsung-family': fetchSamsungManufacturerBom,
  'bosch-family': fetchBoschManufacturerBom,
};

export { resolveTrueOemBrand };

export async function fetchManufacturerBom({ modelNumber, brand, timeoutMs = 12000 }) {
  const trueBrand = resolveTrueOemBrand(brand, modelNumber);
  const family = getManufacturerFamilyConfig(trueBrand, modelNumber);

  if (!family) {
    console.log(`[Adapter Registry] No family config found for: ${trueBrand}`);
    return EMPTY_BOM_RESULT(trueBrand);
  }

  const adapter = ADAPTERS[family.adapterKey];
  if (!adapter) {
    console.log(`[Adapter Registry] No adapter implementation found for: ${family.adapterKey}`);
    return EMPTY_BOM_RESULT(trueBrand);
  }

  console.log(`[Adapter Registry] Routing ${trueBrand} to ${family.adapterKey}`);
  try {
    return await adapter({ modelNumber, brand: trueBrand, timeoutMs, family });
  } catch (error) {
    console.error(`[Adapter Registry] ${family.adapterKey} execution failed`, error);
    return EMPTY_BOM_RESULT(trueBrand);
  }
}
