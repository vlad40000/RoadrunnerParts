/**
 * Worker 1 & 2: Identity Extractor & Validator
 * Deterministic normalization and validation for model/serial identifiers.
 */

import { BRAND_FAMILY_MAP } from './source-router';

/**
 * Normalizes input identifiers by stripping noise and common OCR confusions.
 */
export function normalizeIdentifier(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().toUpperCase().replace(/[\s\.\-\/\\]+/g, '');
}

/**
 * Generates OCR candidate corrections (O/0, I/1, S/5, B/8).
 */
export function getOcrCandidates(val) {
  const normalized = normalizeIdentifier(val);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  
  // Simple common swaps
  const swapMap = {
    'O': '0', '0': 'O',
    'I': '1', '1': 'I',
    'S': '5', '5': 'S',
    'B': '8', '8': 'B',
  };

  // We only generate 1-distance swaps for now to avoid explosion
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (swapMap[char]) {
      const candidate = normalized.substring(0, i) + swapMap[char] + normalized.substring(i + 1);
      candidates.add(candidate);
    }
  }

  return Array.from(candidates);
}

/**
 * Classifies the manufacturer family based on brand name.
 */
export function classifyFamily(brand) {
  if (!brand) return 'Unknown';
  const norm = brand.trim().toLowerCase();
  
  for (const [key, config] of Object.entries(BRAND_FAMILY_MAP)) {
    if (norm === key || norm.includes(key)) {
      return config.family;
    }
  }
  
  return 'Unknown';
}

/**
 * Validates the identity packet.
 */
export function validateIdentity(packet) {
  const errors = [];
  if (!packet.model_normalized) {
    errors.push('Missing normalized model number.');
  }
  
  const isSuspicious = packet.model_normalized && packet.model_normalized.length < 4;
  if (isSuspicious) {
    errors.push('Model number too short to be valid.');
  }

  return {
    ok: errors.length === 0,
    errors,
    identity: packet
  };
}

/**
 * Main Identity Extraction Entry Point
 */
export function extractIdentity({ brand, modelNumber, serialNumber }) {
  const modelNorm = normalizeIdentifier(modelNumber);
  const serialNorm = normalizeIdentifier(serialNumber);
  const family = classifyFamily(brand);

  const packet = {
    brand_raw: brand || null,
    brand_normalized: brand ? brand.trim().toUpperCase() : null,
    model_raw: modelNumber || null,
    model_normalized: modelNorm,
    serial_raw: serialNumber || null,
    serial_normalized: serialNorm,
    product_code: null,
    revision_hint: null,
    manufacturer_family: family,
    confidence: modelNorm ? 0.95 : 0.0,
  };

  return packet;
}
