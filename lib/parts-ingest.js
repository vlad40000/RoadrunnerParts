import { sql } from '@/lib/db';
import { normalizeModelNumber } from '@/lib/normalize';

/**
 * Persists raw parts rows to the ingestion layer.
 * Normalizes field names between manufacturer/distributor adapters.
 */
export async function ingestRawParts(canonicalModel, src, rawParts) {
  const model = normalizeModelNumber(canonicalModel);
  if (!Array.isArray(rawParts) || rawParts.length === 0) return;

  try {
    const CHUNK_SIZE = 25;
    for (let i = 0; i < rawParts.length; i += CHUNK_SIZE) {
      const chunk = rawParts.slice(i, i + CHUNK_SIZE);
      const insertPromises = chunk.map((part) => {
        const rawPartNumber = String(part.rawPartNumber || part.partNumber || '').trim().toUpperCase();
        if (!rawPartNumber) return null;

        return sql`
          INSERT INTO model_parts_raw (
            canonical_model,
            source,
            section_name,
            diagram_ref,
            provider_item_id,
            raw_part_number,
            raw_part_name,
            raw_category,
            quantity,
            substitute_part_number,
            serial_note,
            raw_payload
          )
          VALUES (
            ${model},
            ${String(part.source || src || 'unknown').trim().toLowerCase()},
            ${part.sectionName || part.section || 'General Assembly'},
            ${part.diagramRef || null},
            ${part.providerItemId || null},
            ${rawPartNumber},
            ${String(part.rawPartName || part.name || part.partName || '').trim()},
            ${String(part.rawCategory || part.category || part.sectionName || '').trim()},
            ${part.quantity || null},
            ${part.substitutePartNumber || part.substitute || part.substitutePart || null},
            ${part.serialNote || part.applicability || null},
            ${JSON.stringify(part)}::jsonb
          );
        `;
      });
      await Promise.all(insertPromises.filter(Boolean));
    }
  } catch (err) {
    console.error('ingestRawParts batch error', err);
  }
}
