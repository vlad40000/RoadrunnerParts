import 'server-only';
import { fetchPartsList } from '@/lib/gemini';
import { EMPTY_BOM_RESULT } from './base';

/**
 * Maps structured Gemini BOM rows (standard extraction shape) to the raw manufacturer row shape.
 */
export function mapStructuredRowsToRaw(parts = [], sourceFallback = 'unknown') {
  return (parts || [])
    .map((part) => ({
      source: String(part.source || sourceFallback || 'unknown').trim().toLowerCase(),
      sectionName: part.section || 'General Assembly',
      sectionUrl: null,
      diagramRef: part.diagramRef || null,
      providerItemId: part.providerItemId || null,
      rawPartNumber: String(part.partNumber || '').trim().toUpperCase(),
      rawPartName: String(part.name || part.partName || '').trim(),
      rawCategory: String(part.category || part.section || '').trim(),
      quantity: part.quantity || null,
      substitutePartNumber: part.substitute || null,
      serialNote: part.serialNote || null,
      evidenceUrl: null,
      rawPayload: part,
    }))
    .filter((part) => part.rawPartNumber);
}

/**
 * Honest stub for manufacturer families without deterministic scrapers.
 * Do not pretend retrieval works when there is no real adapter.
 */
export async function fetchGenericManufacturerFamilyBom({
  brand,
  truthSource,
  manufacturerDomains = [],
  strategy = 'manufacturer-first-generic',
}) {
  const empty = EMPTY_BOM_RESULT(brand || 'Unknown');
  const primaryDomain = manufacturerDomains[0] || 'unknown';

  return {
    ...empty,
    truthSource: truthSource || `${brand || 'Unknown'} manufacturer catalog`,
    sourceStrategy: `${strategy}-stub`,
    modelUrl: null,
    summary: null,
    source: primaryDomain,
    parts: [],
    sources: [],
    coverage: {
      sectionsDiscovered: 0,
      sectionsFetched: 0,
      sectionFetchFailures: 0,
      paginationComplete: false,
      flags: ['adapter-not-implemented', 'manufacturer-no-parts'],
    },
  };
}
