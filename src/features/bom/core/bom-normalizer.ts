import type { BomRow } from "../schemas/bom";

function cleanPart(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return v.length ? v : null;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeModel(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

const CANONICAL_TAXONOMY: Record<string, string> = {
  // Controls and console
  "control panel": "Controls and console",
  "controls/top panel": "Controls and console",
  "top and console parts": "Controls and console",
  "control panel & controls": "Controls and console",
  "control hood": "Controls and console",
  "timer": "Controls and console",

  // Cabinet and structure
  "cabinet": "Cabinet, top, frame, and outer shell",
  "cabinet parts": "Cabinet, top, frame, and outer shell",
  "cabinet/top": "Cabinet, top, frame, and outer shell",
  "top and cabinet": "Cabinet, top, frame, and outer shell",
  "frame & cover": "Cabinet, top, frame, and outer shell",
  "base/side & rear panels": "Cabinet, top, frame, and outer shell",

  // Door and access
  "front panel & door": "Door, front access, and seal",
  "door": "Door, front access, and seal",
  "door parts": "Door, front access, and seal",
  "loading door": "Door, front access, and seal",
  "access panel": "Door, front access, and seal",

  // Rotating assembly
  "drum": "Rotating assembly",
  "drum assembly": "Rotating assembly",
  "drum and tub assembly": "Rotating assembly",
  "tub, basket & agitator": "Rotating assembly",
  "basket and tub parts": "Rotating assembly",

  // Bulkhead and support
  "bulkhead parts": "Bulkhead, support, and seals",
  "front bulkhead": "Bulkhead, support, and seals",
  "rear bulkhead": "Bulkhead, support, and seals",
  "felt seal": "Bulkhead, support, and seals",

  // Drive system
  "motor": "Drive system",
  "motor & belt": "Drive system",
  "suspension": "Drive system",
  "brake, clutch, gearcase, motor and pump": "Drive system",
  "gearcase": "Drive system",
  "machine base": "Drive system",

  // Heat, airflow, and gas
  "burner": "Heat, airflow, and gas",
  "gas valve & burner assembly": "Heat, airflow, and gas",
  "duct heater": "Heat, airflow, and gas",
  "heater box": "Heat, airflow, and gas",
  "exhaust duct": "Heat, airflow, and gas",

  // Water inlet and dispenser
  "water system": "Water inlet, dispenser, and drawer",
  "dispenser assembly": "Water inlet, dispenser, and drawer",
  "drawer": "Water inlet, dispenser, and drawer",
  "mixing valve": "Water inlet, dispenser, and drawer",

  // Electrical and wiring
  "wiring harness": "Electrical, wiring, and terminal power",
  "wire harnesses/wires": "Electrical, wiring, and terminal power",
  "terminal block": "Electrical, wiring, and terminal power",
  "power cord": "Electrical, wiring, and terminal power",

  // Meter and vend
  "meter case": "Meter, vend, and audit",
  "service door and meter case": "Meter, vend, and audit",
  "coin slide": "Meter, vend, and audit",

  // Documentation and extras
  "optional parts": "Documentation, optional, labels, and service extras",
  "wiring diagram": "Documentation, optional, labels, and service extras",
  "labels": "Documentation, optional, labels, and service extras",
  "miscellaneous": "Documentation, optional, labels, and service extras",
  "special tools": "Documentation, optional, labels, and service extras",
};

function getCanonicalSection(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  
  // 1. Direct match
  if (CANONICAL_TAXONOMY[normalized]) return CANONICAL_TAXONOMY[normalized];

  // 2. Keyword/Substring fuzzy match
  for (const [key, canonical] of Object.entries(CANONICAL_TAXONOMY)) {
    if (normalized.includes(key)) return canonical;
  }

  // 3. Fallback to title-cased raw string
  return raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function isPartCompatibleWithAppliance(row: BomRow, productType: string | null): boolean {
  if (!productType) return true;
  
  const desc = (row.description || '').toLowerCase();
  const section = (row.section || '').toLowerCase();
  const pType = productType.toLowerCase();

  // Rule: Reject dishwasher-only components for non-dishwasher appliances
  const dishwasherKeywords = ['spray arm', 'rack assembly', 'upper rack', 'lower rack', 'cutlery basket', 'tine row'];
  const isDishwasherPart = dishwasherKeywords.some(k => desc.includes(k) || section.includes(k));
  if (pType !== 'dishwasher' && isDishwasherPart) return false;

  // Rule: Dryer type validation (Gas vs Electric)
  const gasKeywords = ['burner assembly', 'igniter', 'gas valve', 'gas orifice', 'manifold'];
  const isGasPart = gasKeywords.some(k => desc.includes(k) || section.includes(k));
  
  // Note: For now, we only reject if the model is explicitly known to be electric or if the type is mismatched.
  // Future: Add explicit Gas/Electric detection to identityContext.

  return true;
}

function makeKey(row: BomRow) {
  const pn = normalizeModel(row.currentServicePartNumber || row.originalPartNumber);
  const section = (row.section || 'General').toLowerCase().trim();
  // Part number is the primary unique identifier; section is secondary
  return pn ? `pn:${pn}` : `sec:${section}:${normalizeModel(row.description)}`;
}

function getListedPrice(row: BomRow): number | null {
  if (typeof row.price === "number") return row.price;
  const listedPrice = row.retailPrice?.listedPrice;
  return typeof listedPrice === "number" ? listedPrice : null;
}

export function normalizeBomRows(rows: BomRow[], context?: { productType?: string | null }): BomRow[] {
  const map = new Map<string, BomRow>();

  for (const row of rows) {
    // Model-Compatibility Gate
    if (context?.productType && !isPartCompatibleWithAppliance(row, context.productType)) {
      continue;
    }

    const rawSection = cleanText(row.section);
    const canonicalSection = getCanonicalSection(rawSection);
    const partNumber = cleanPart(row.currentServicePartNumber || row.originalPartNumber);
    const listedPrice = getListedPrice(row);

    const normalized: BomRow = {
      ...row,
      section: canonicalSection,
      sectionOriginal: rawSection,
      diagramNumber:
        typeof row.diagramNumber === "string"
          ? cleanText(row.diagramNumber)
          : row.diagramNumber,
      originalPartNumber: cleanPart(row.originalPartNumber),
      currentServicePartNumber: cleanPart(row.currentServicePartNumber),
      description: cleanText(row.description),
      sourceUrl: cleanText(row.sourceUrl),
      replacementNote: row.replacementNote ? cleanText(row.replacementNote) : null,
      confidence: Number.isFinite(row.confidence) ? row.confidence : 0.5,
      price: listedPrice,
      priceMissing: listedPrice === null,
    };

    // Use partNumber as the primary key for union
    const key = partNumber ? `pn:${partNumber}` : `sec:${canonicalSection}:${normalizeModel(row.description)}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, normalized);
      continue;
    }

    // Lossless Merge: Preserve multiple sections and ref IDs
    const mergedSections = new Set((existing.section ?? "").split(";").map(s => s.trim()).filter(Boolean));
    mergedSections.add(normalized.section);

    const mergedRefs = new Set((String(existing.diagramNumber ?? "")).split(";").map(s => s.trim()).filter(Boolean));
    mergedRefs.add(String(normalized.diagramNumber));

    const mergedSources = new Set((existing.sourceUrl ?? "").split(";").map(s => s.trim()).filter(Boolean));
    mergedSources.add(normalized.sourceUrl);

    // Price Optimization: Lowest price retained
    const lowestPrice = (existing.price && normalized.price) 
      ? Math.min(existing.price, normalized.price)
      : (existing.price || normalized.price || null);

    const mergedSourcesArr = [...mergedSources];
    const hasAgreement = mergedSourcesArr.length >= 2;

    map.set(key, {
      ...existing,
      section: [...mergedSections].join("; "),
      diagramNumber: [...mergedRefs].join("; "),
      sourceUrl: mergedSourcesArr.join("; "),
      originalPartNumber: existing.originalPartNumber ?? normalized.originalPartNumber,
      currentServicePartNumber:
        existing.currentServicePartNumber ?? normalized.currentServicePartNumber,
      nlaStatus: existing.nlaStatus || normalized.nlaStatus,
      confidence: Math.max(existing.confidence, normalized.confidence),
      replacementNote: existing.replacementNote ?? normalized.replacementNote ?? null,
      price: lowestPrice,
      priceMissing: !lowestPrice,
      evidence: hasAgreement ? (existing.evidence || "source_agreement") : (existing.evidence ?? null),
    });
  }

  // Final Pass: Flag low confidence parts that have no agreement
  const results = [...map.values()].map((row) => {
    const sourceCount = (row.sourceUrl ?? "").split(";").length;
    if (sourceCount < 2) {
      return { ...row, confidence: Math.min(row.confidence, 0.6), evidence: (row.evidence ? row.evidence + "; " : "") + "low_confidence_part" };
    }
    return row;
  });

  return results.sort((a, b) => {
    const s = a.section.localeCompare(b.section);
    if (s !== 0) return s;

    const aNum = Number(a.diagramNumber);
    const bNum = Number(b.diagramNumber);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;

    return String(a.diagramNumber).localeCompare(String(b.diagramNumber));
  });
}
