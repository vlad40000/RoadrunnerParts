// import "server-only";

import type { Identity } from "../schemas/bom";
import { decodeSerialNumber } from "@/lib/serial/decoder";
import {
  getManufacturerFamilyConfig,
  resolveTrueOemBrand,
} from "@/lib/providers/manufacturer/family-config";

export type BomIdentityContext = {
  displayBrand: string | null;
  resolvedBrand: string | null;
  model: string | null;
  serial: string | null;
  productType: string | null;
  identityConfidence: number;
  familyKey: string | null;
  adapterKey: string | null;
  manufacturerDomains: string[];
  searchConfidence: number;
  serialProfile: Record<string, unknown> | null;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function scoreSearchConfidence(input: {
  identityConfidence: number;
  familyKey: string | null;
  serialProfile: any;
  resolvedBrandChanged: boolean;
}) {
  let score = 0;

  score += clamp(input.identityConfidence) * 0.55;

  if (input.familyKey) score += 0.15;

  if (input.serialProfile?.selectedYear) score += 0.15;

  if (input.serialProfile?.confidence === "high") score += 0.15;
  else if (input.serialProfile?.confidence === "medium") score += 0.1;
  else if (input.serialProfile?.confidence === "low") score += 0.03;

  if (input.resolvedBrandChanged) score += 0.05;

  return clamp(score);
}

export async function buildBomIdentityContext(
  identity: Identity,
): Promise<BomIdentityContext> {
  const displayBrand = identity.brand ?? null;
  const model = identity.model ?? null;
  const serial = identity.serial ?? null;

  const resolvedBrand = model
    ? resolveTrueOemBrand(displayBrand, model)
    : displayBrand;

  const family = model
    ? getManufacturerFamilyConfig(resolvedBrand, model)
    : null;

  let serialProfile: Record<string, unknown> | null = null;

  if (serial && resolvedBrand && model) {
    try {
      serialProfile = await decodeSerialNumber(serial, {
        brand: resolvedBrand,
        model,
      });
    } catch {
      serialProfile = null;
    }
  }

  const searchConfidence = scoreSearchConfidence({
    identityConfidence: identity.confidence ?? 0,
    familyKey: family?.key ?? null,
    serialProfile,
    resolvedBrandChanged:
      Boolean(displayBrand) &&
      Boolean(resolvedBrand) &&
      String(displayBrand).trim().toLowerCase() !==
        String(resolvedBrand).trim().toLowerCase(),
  });

  return {
    displayBrand,
    resolvedBrand: resolvedBrand || null,
    model,
    serial,
    productType: identity.productType ?? null,
    identityConfidence: identity.confidence ?? 0,
    familyKey: family?.key ?? null,
    adapterKey: family?.adapterKey ?? null,
    manufacturerDomains: family?.domains ?? [],
    searchConfidence,
    serialProfile,
  };
}
