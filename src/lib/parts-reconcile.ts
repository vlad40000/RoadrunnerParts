import { sql } from './db';

function normPartNumber(pn: string | null | undefined): string {
  return String(pn || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

const CATEGORY_MAP: Record<string, string> = {
  heating: 'Heating',
  heat: 'Heating',
  controls: 'Controls',
  control: 'Controls',
  electrical: 'Controls',
  drive: 'Drive',
  motor: 'Drive',
  drum: 'Drive',
  door: 'Door & Panels',
  panel: 'Door & Panels',
  panels: 'Door & Panels',
  cabinet: 'Cabinet & Frame',
  frame: 'Cabinet & Frame',
  top: 'Cabinet & Frame',
  bulkhead: 'Cabinet & Frame',
  exhaust: 'Exhaust & Ventilation',
  vent: 'Exhaust & Ventilation',
  ventilation: 'Exhaust & Ventilation',
  gas: 'Gas System',
  burner: 'Gas System',
  water: 'Water System',
  pump: 'Water System',
  valve: 'Water System',
  dispenser: 'Dispenser',
  ice: 'Ice System',
  icemaker: 'Ice System',
  compressor: 'Refrigeration',
  refrigeration: 'Refrigeration',
  sealed: 'Sealed System',
  evaporator: 'Refrigeration',
  condenser: 'Refrigeration',
  wash: 'Wash System',
  spray: 'Wash System',
  tub: 'Tub & Basket',
  basket: 'Tub & Basket',
  agitator: 'Tub & Basket',
  transmission: 'Transmission',
  gearcase: 'Transmission',
  suspension: 'Suspension',
  spring: 'Suspension',
  leveling: 'Suspension',
  shelf: 'Shelving',
  shelves: 'Shelving',
  rack: 'Shelving',
  drawer: 'Drawers',
  liner: 'Liner',
  seal: 'Seals & Gaskets',
  gasket: 'Seals & Gaskets',
  hose: 'Hoses & Connectors',
  connector: 'Hoses & Connectors',
  harness: 'Wiring',
  wiring: 'Wiring',
  wire: 'Wiring',
  sensor: 'Sensors',
  thermistor: 'Sensors',
  thermostat: 'Controls',
  timer: 'Controls',
  board: 'Controls',
  pcb: 'Controls',
  interface: 'Controls',
  latch: 'Door & Panels',
  hinge: 'Door & Panels',
  handle: 'Door & Panels',
  belt: 'Drive',
  pulley: 'Drive',
  idler: 'Drive',
  roller: 'Drive',
  bearing: 'Drive',
  element: 'Heating',
  igniter: 'Heating',
  fuse: 'Controls',
  switch: 'Controls',
  filter: 'Filtration',
  light: 'Lighting',
  bulb: 'Lighting',
  led: 'Lighting',
  knob: 'Knobs & Buttons',
  button: 'Knobs & Buttons',
};

function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return 'Uncategorized';
  const lower = String(raw).trim().toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return val;
  }
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanSection(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return 'General Assembly';
  return value.replace(/\s+/g, ' ');
}

function sourceRank(source: string | null | undefined): number {
  const s = String(source || '').toLowerCase();
  if (s.includes('encompass.com')) return 10;
  if (s.includes('partselect.com')) return 8;
  if (s.includes('repairclinic.com')) return 7;
  if (s.includes('reliableparts.com')) return 6;
  if (s.includes('searspartsdirect.com')) return 4;
  if (s.includes('fix.com')) return 5;
  if (s !== 'unknown') return 2;
  return 1;
}

function isBetterPreferredRow(candidate: any, current: any): boolean {
  if (!current) return true;

  const candidateRank = sourceRank(candidate?.source);
  const currentRank = sourceRank(current?.source);
  if (candidateRank !== currentRank) return candidateRank > currentRank;

  const candidateNameLength = String(candidate?.raw_part_name || candidate?.description || '').length;
  const currentNameLength = String(current?.raw_part_name || current?.description || '').length;
  return candidateNameLength > currentNameLength;
}

export async function reconcileParts(canonicalModel: string, rawParts: any[], options: any = {}) {
  const model = String(canonicalModel).trim().toUpperCase();

  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    return { masterParts: options.initialMasterParts || [], completenessScore: 0, sectionCount: 0 };
  }

  const partMap = new Map<string, any>();

  // Seed with previous master parts if provided
  if (Array.isArray(options.initialMasterParts)) {
    for (const mp of options.initialMasterParts) {
      partMap.set(mp.canonicalPartNumber, {
        canonicalPartNumber: mp.canonicalPartNumber,
        canonicalPartName: mp.canonicalPartName,
        sources: new Set(Object.keys(mp.sourceConfidence || {})),
        sections: new Set([mp.normalizedSection]),
        categories: new Set([mp.normalizedCategory]),
        substitutes: new Set(mp.substituteChain),
        serialNotes: new Set(mp.serialApplicability),
        rawRows: mp.providerRows || [],
        conflictFlags: mp.conflictFlags || [],
        preferredRow: mp.providerRows?.length ? mp.providerRows[0] : null,
        // High-fidelity fields
        price_cents: mp.price_cents,
        currency: mp.currency || 'USD',
        availability_status: mp.availability_status,
        mapped_encompass_assembly: mp.mapped_encompass_assembly,
        mapping_status: mp.mapping_status || 'unmapped',
        evidence_text: mp.evidence_text,
      });
    }
  }

  for (const raw of rawParts) {
    const normPN = normPartNumber(raw.raw_part_number || raw.partNumber);
    if (!normPN) continue;

    if (!partMap.has(normPN)) {
      partMap.set(normPN, {
        canonicalPartNumber: normPN,
        canonicalPartName: raw.raw_part_name || raw.description || '',
        sources: new Set(),
        sections: new Set(),
        categories: new Set(),
        substitutes: new Set(),
        serialNotes: new Set(),
        rawRows: [],
        conflictFlags: [],
        preferredRow: null,
        // Default high-fidelity fields
        price_cents: null,
        currency: 'USD',
        availability_status: null,
        mapped_encompass_assembly: null,
        mapping_status: 'unmapped',
        evidence_text: null,
      });
    }

    const entry = partMap.get(normPN);
    if (raw.source) entry.sources.add(raw.source);
    if (raw.section_name) entry.sections.add(raw.section_name);
    if (raw.raw_category) entry.categories.add(raw.raw_category);
    if (raw.substitute_part_number) entry.substitutes.add(normPartNumber(raw.substitute_part_number));
    if (raw.serial_note) entry.serialNotes.add(raw.serial_note);
    entry.rawRows.push(raw);

    // Update high-fidelity fields if provided in raw row
    if (raw.price_cents) entry.price_cents = raw.price_cents;
    if (raw.price && !raw.price_cents) entry.price_cents = Math.round(raw.price * 100);
    if (raw.currency) entry.currency = raw.currency;
    if (raw.availability_status) entry.availability_status = raw.availability_status;
    if (raw.mapped_encompass_assembly) entry.mapped_encompass_assembly = raw.mapped_encompass_assembly;
    if (raw.mapping_status) entry.mapping_status = raw.mapping_status;
    if (raw.evidence_text) entry.evidence_text = raw.evidence_text;

    if (
      entry.canonicalPartName &&
      (raw.raw_part_name || raw.description) &&
      entry.canonicalPartName.toLowerCase() !== (raw.raw_part_name || raw.description).toLowerCase()
    ) {
      entry.conflictFlags.push({
        type: 'name_mismatch',
        existing: entry.canonicalPartName,
        incoming: raw.raw_part_name || raw.description,
        source: raw.source,
      });

      if (isBetterPreferredRow(raw, entry.preferredRow)) {
        entry.canonicalPartName = raw.raw_part_name || raw.description;
      }
    }

    if (isBetterPreferredRow(raw, entry.preferredRow)) {
      entry.preferredRow = raw;
    }
  }

  const masterParts: any[] = [];
  for (const [normPN, entry] of partMap) {
    const preferredRow = entry.preferredRow || entry.rawRows[0] || {};
    const preferredSection = cleanSection(preferredRow.section_name || [...entry.sections][0] || 'General Assembly');
    const preferredCategory = normalizeCategory(preferredRow.raw_category || preferredSection);
    const preferredSource = preferredRow.source || [...entry.sources][0] || 'unknown';

    masterParts.push({
      canonicalModel: model,
      canonicalPartNumber: normPN,
      canonicalPartName: entry.canonicalPartName,
      normalizedSection: preferredSection,
      normalizedCategory: preferredCategory,
      preferredSource,
      substituteChain: [...entry.substitutes].filter(Boolean),
      serialApplicability: [...entry.serialNotes],
      providerRows: entry.rawRows,
      sourceConfidence: Object.fromEntries([...entry.sources].map((s) => [s, { observed: true, rank: sourceRank(s) }])),
      conflictFlags: entry.conflictFlags,
      // High-fidelity fields
      price_cents: entry.price_cents,
      currency: entry.currency,
      availability_status: entry.availability_status,
      mapped_encompass_assembly: entry.mapped_encompass_assembly,
      mapping_status: entry.mapping_status,
      evidence_text: entry.evidence_text,
    });
  }

  const uniqueSections = new Set(masterParts.map((p) => p.normalizedSection)).size;
  const uniqueParts = masterParts.length;
  const completenessScore = Math.min(100, Math.round((uniqueParts / 60) * 65 + (uniqueSections / 8) * 35));

  if (options.persist !== false) {
    await persistMasterParts(masterParts);
  }

  return { masterParts, completenessScore, sectionCount: uniqueSections };
}

export async function persistMasterParts(masterParts: any[] = []) {
  if (masterParts.length === 0) return { persistedCount: 0 };
  
  const CHUNK_SIZE = 250;
  let persistedCount = 0;

  for (let i = 0; i < masterParts.length; i += CHUNK_SIZE) {
    const chunkEntries = masterParts.slice(i, i + CHUNK_SIZE);
    
    for (const mp of chunkEntries) {
      try {
        await sql`
          INSERT INTO model_parts_master (
            canonical_model, canonical_part_number, canonical_part_name,
            normalized_section, normalized_category, preferred_source,
            substitute_chain, serial_applicability, provider_rows,
            source_confidence, conflict_flags, 
            price_cents, currency, availability_status, 
            mapped_encompass_assembly, mapping_status, evidence_text,
            updated_at
          )
          VALUES (
            ${mp.canonicalModel},
            ${mp.canonicalPartNumber},
            ${mp.canonicalPartName},
            ${mp.normalizedSection},
            ${mp.normalizedCategory},
            ${mp.preferredSource},
            ${JSON.stringify(mp.substituteChain)}::jsonb,
            ${JSON.stringify(mp.serialApplicability)}::jsonb,
            ${JSON.stringify(mp.providerRows)}::jsonb,
            ${JSON.stringify(mp.sourceConfidence)}::jsonb,
            ${JSON.stringify(mp.conflictFlags)}::jsonb,
            ${mp.price_cents},
            ${mp.currency},
            ${mp.availability_status},
            ${mp.mapped_encompass_assembly},
            ${mp.mapping_status},
            ${mp.evidence_text},
            NOW()
          )
          ON CONFLICT (canonical_model, canonical_part_number) DO UPDATE SET
            canonical_part_name = EXCLUDED.canonical_part_name,
            normalized_section = EXCLUDED.normalized_section,
            normalized_category = EXCLUDED.normalized_category,
            preferred_source = EXCLUDED.preferred_source,
            substitute_chain = EXCLUDED.substitute_chain,
            serial_applicability = EXCLUDED.serial_applicability,
            provider_rows = EXCLUDED.provider_rows,
            source_confidence = EXCLUDED.source_confidence,
            conflict_flags = EXCLUDED.conflict_flags,
            price_cents = COALESCE(EXCLUDED.price_cents, model_parts_master.price_cents),
            currency = COALESCE(EXCLUDED.currency, model_parts_master.currency),
            availability_status = COALESCE(EXCLUDED.availability_status, model_parts_master.availability_status),
            mapped_encompass_assembly = COALESCE(EXCLUDED.mapped_encompass_assembly, model_parts_master.mapped_encompass_assembly),
            mapping_status = COALESCE(EXCLUDED.mapping_status, model_parts_master.mapping_status),
            evidence_text = COALESCE(EXCLUDED.evidence_text, model_parts_master.evidence_text),
            updated_at = NOW();
        `;
        persistedCount += 1;
      } catch (rowErr) {
        console.error('[PartsReconcile] Error persisting master part:', rowErr);
      }
    }
  }

  return { persistedCount };
}
