/**
 * Chain-of-Verification utility for rendered browser extractions.
 */

export const APPLIANCE_SECTION_HINTS = {
  washer: ['basket', 'tub', 'agitator', 'drive', 'pump', 'motor', 'console', 'valve', 'cabinet', 'lid', 'top', 'gearcase'],
  dryer: ['drum', 'cabinet', 'bulkhead', 'motor', 'belt', 'heating', 'gas', 'burner', 'exhaust', 'console', 'door'],
  refrigerator: ['cabinet', 'door', 'shelf', 'bin', 'evaporator', 'compressor', 'condenser', 'ice', 'water', 'dispenser'],
  dishwasher: ['rack', 'spray', 'pump', 'motor', 'door', 'seal', 'gasket', 'control', 'tub', 'water', 'drain'],
  range: ['cooktop', 'burner', 'oven', 'door', 'control', 'drawer', 'wiring', 'gas', 'element'],
  microwave: ['door', 'control', 'cavity', 'turntable', 'magnetron', 'transformer', 'wiring'],
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function partNumberOf(part) {
  return String(
    part.rawPartNumber ||
      part.partNumber ||
      part.part_number ||
      part.currentServicePartNumber ||
      '',
  ).trim().toUpperCase();
}

export function dedupeParts(parts = []) {
  const seen = new Set();
  const out = [];

  for (const part of parts) {
    const partNumber = partNumberOf(part);
    if (!partNumber) continue;

    const section = normalize(part.sectionName || part.section || 'General Assembly');
    const key = `${partNumber}|${section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...part, partNumber });
  }

  return out;
}

export function verifyBomCompleteness({
  parts = [],
  targetCount = null,
  applianceType = null,
  threshold = 0.95,
}) {
  const uniquePartNumbers = new Set(parts.map(partNumberOf).filter(Boolean));
  const extractedCount = uniquePartNumbers.size;
  const normalizedTarget = Number(targetCount || 0) > 0 ? Number(targetCount) : null;
  const coverageRatio = normalizedTarget ? extractedCount / normalizedTarget : null;

  const foundSectionText = parts
    .map((part) => normalize(part.sectionName || part.section))
    .filter(Boolean)
    .join(' | ');

  const hints = APPLIANCE_SECTION_HINTS[normalize(applianceType)] || [];
  const missingHints = hints.filter((hint) => !foundSectionText.includes(normalize(hint)));

  let status = 'NO_TARGET';
  if (normalizedTarget) {
    if (extractedCount > normalizedTarget) {
      status = 'OVER_COUNT';
    } else if (coverageRatio >= threshold) {
      status = 'MATCH';
    } else {
      status = missingHints.length ? 'MISMATCH' : 'MISMATCH_NO_SECTIONS';
    }
  }

  return {
    status,
    extractedCount,
    targetCount: normalizedTarget,
    shortfall: normalizedTarget ? Math.max(0, normalizedTarget - extractedCount) : null,
    coverageRatio,
    threshold,
    missingHints,
  };
}
