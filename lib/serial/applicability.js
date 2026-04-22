import 'server-only';
import { normalizeSerialNumber } from './normalize';

export function parseSerialNote(note) {
  if (!note) return null;
  const n = String(note).toLowerCase().trim();

  const rangeMatch = n.match(/(?:serial\s+range|serials?\s+)([a-z0-9]+)\s*(?:-|to|through)\s*([a-z0-9]+)/i);
  if (rangeMatch) return { type: 'range', start: normalizeSerialNumber(rangeMatch[1]), end: normalizeSerialNumber(rangeMatch[2]) };

  const beforeMatch = n.match(/(?:before|prior to|up to|through)\s+(?:serial\s*)?([a-z0-9]+)/i);
  if (beforeMatch) return { type: 'before', value: normalizeSerialNumber(beforeMatch[1]) };

  const afterMatch = n.match(/(?:after|from|starting with|starting at|since)\s+(?:serial\s*)?([a-z0-9]+)/i);
  if (afterMatch) return { type: 'after', value: normalizeSerialNumber(afterMatch[1]) };

  const yearAfterMatch = n.match(/(?:manufactured|made|built)\s+(?:after|since)\s+(\d{4})/i);
  if (yearAfterMatch) return { type: 'year_after', year: parseInt(yearAfterMatch[1], 10) };

  const yearBeforeMatch = n.match(/(?:manufactured|made|built)\s+(?:before|prior to)\s+(\d{4})/i);
  if (yearBeforeMatch) return { type: 'year_before', year: parseInt(yearBeforeMatch[1], 10) };

  return null;
}

function evaluateConstraint(serial, profile, constraint) {
  const normSerial = normalizeSerialNumber(serial);
  const { type, value, start, end, year } = constraint;

  switch (type) {
    case 'before':
      return normSerial < value;
    case 'after':
      return normSerial >= value;
    case 'range':
      return normSerial >= start && normSerial <= end;
    case 'year_after':
      return typeof profile?.selectedYear === 'number' ? profile.selectedYear >= year : true;
    case 'year_before':
      return typeof profile?.selectedYear === 'number' ? profile.selectedYear < year : true;
    default:
      return true;
  }
}

export function evaluateSerialApplicability({ serialNumber, serialProfile, note }) {
  if (!serialNumber && (!serialProfile || !serialProfile.selectedYear)) {
    return { isApplicable: true, confidence: 'none', reason: 'no serial provided' };
  }

  const constraint = parseSerialNote(note);
  if (!constraint) {
    return { isApplicable: true, confidence: 'uncertain', reason: 'unparseable note', needsReview: true };
  }

  const isApplicable = evaluateConstraint(serialNumber, serialProfile, constraint);
  
  const confidence = serialProfile?.confidence || 'medium';
  const canExclude = confidence === 'high' || constraint.type === 'range';

  return {
    isApplicable,
    confidence,
    reason: `Matched constraint: ${constraint.type}`,
    needsReview: !isApplicable && !canExclude,
  };
}

export function filterPartsBySerialApplicability(parts, { serialNumber, serialProfile }) {
  const applicableParts = [];
  const filteredOutParts = [];
  const reviewParts = [];
  
  if (!serialNumber && !serialProfile?.selectedYear) {
    return {
      applicableParts: parts,
      filteredOutParts: [],
      reviewParts: [],
      applicabilityMode: 'no_serial_filter',
      stats: { total: parts.length, filtered: 0, review: 0 }
    };
  }

  for (const part of parts) {
    const notes = Array.isArray(part.serialApplicability) 
      ? part.serialApplicability 
      : [part.serialNote].filter(Boolean);

    if (notes.length === 0) {
      applicableParts.push(part);
      continue;
    }

    let isDefinitelyExcluded = false;
    let needsReview = false;

    for (const note of notes) {
      const evaluation = evaluateSerialApplicability({ serialNumber, serialProfile, note });
      if (evaluation.needsReview) needsReview = true;
      if (!evaluation.isApplicable && evaluation.confidence === 'high' && !evaluation.needsReview) {
        isDefinitelyExcluded = true;
      }
    }

    if (isDefinitelyExcluded) {
      filteredOutParts.push(part);
    } else if (needsReview) {
      reviewParts.push(part);
      applicableParts.push(part);
    } else {
      applicableParts.push(part);
    }
  }

  return {
    applicableParts,
    filteredOutParts,
    reviewParts,
    applicabilityMode: serialProfile?.confidence === 'high' ? 'exact_serial' : 'inferred_serial',
    stats: {
      total: parts.length,
      applicable: applicableParts.length,
      filtered: filteredOutParts.length,
      review: reviewParts.length
    }
  };
}
