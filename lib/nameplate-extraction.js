import { sql } from '@/lib/db';
import crypto from 'crypto';

/**
 * Nameplate Extraction Persistence
 *
 * Stores extraction results from image/nameplate parsing
 * into the nameplate_extractions table.
 */

/**
 * Save a nameplate extraction result.
 *
 * @param {object} opts
 * @param {string} opts.imageBase64 - Base64-encoded image for hashing
 * @param {string} opts.brand
 * @param {string} opts.rawModel
 * @param {string} opts.rawSerial
 * @param {string} opts.productType
 * @param {string} opts.engineeringCode
 * @param {object} opts.confidence - Confidence scores from extraction
 */
export async function saveNameplateExtraction({
  imageBase64,
  brand,
  rawModel,
  rawSerial,
  productType,
  engineeringCode,
  confidence,
  imageUrl,
}) {
  const imageHash = crypto
    .createHash('sha256')
    .update(imageBase64 || '')
    .digest('hex')
    .substring(0, 32);

  try {
    await sql`
      INSERT INTO nameplate_extractions (
        image_hash, brand, raw_model, raw_serial,
        product_type, engineering_code, confidence_json,
        image_url
      )
      VALUES (
        ${imageHash},
        ${brand || null},
        ${rawModel || null},
        ${rawSerial || null},
        ${productType || null},
        ${engineeringCode || null},
        ${JSON.stringify(confidence || {})}::jsonb,
        ${imageUrl || null}
      );
    `;
    console.log(`[Nameplate] Saved extraction: model=${rawModel}, brand=${brand}`);
  } catch (err) {
    console.error('saveNameplateExtraction error', err);
  }
}

/**
 * Look up a previous extraction by image hash.
 */
export async function findExtractionByHash(imageBase64) {
  const imageHash = crypto
    .createHash('sha256')
    .update(imageBase64 || '')
    .digest('hex')
    .substring(0, 32);

  try {
    const rows = await sql`
      SELECT brand, raw_model, raw_serial, product_type, engineering_code, confidence_json, image_url
      FROM nameplate_extractions
      WHERE image_hash = ${imageHash}
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('findExtractionByHash error', err);
    return null;
  }
}
