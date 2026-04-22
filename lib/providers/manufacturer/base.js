import 'server-only';

/**
 * @typedef {Object} ManufacturerBomPartRow
 * @property {string} source - The exact domain source (e.g., geapplianceparts.com)
 * @property {string} sectionName - Native section/diagram name
 * @property {string|null} [sectionUrl] - URL to the section page
 * @property {string|null} [diagramRef] - Item/reference number on diagram
 * @property {string|null} [providerItemId] - Provider-specific ID
 * @property {string} rawPartNumber - Part number as found
 * @property {string} rawPartName - Part name as found
 * @property {string|null} [rawCategory] - Provider-native category
 * @property {string|null} [quantity] - Qty per machine
 * @property {string|null} [substitutePartNumber] - Direct replacement
 * @property {string|null} [serialNote] - Applicability notes
 * @property {string|null} [evidenceUrl] - Page where row was verified
 * @property {Object} [rawPayload] - Full raw data for debugging
 */

/**
 * @typedef {Object} ManufacturerBomResult
 * @property {string} truthSource - Human label (e.g., "GE Manufacturer Catalog")
 * @property {string} sourceStrategy - Strategy label (e.g., "manufacturer-first-deterministic")
 * @property {string|null} [modelUrl] - Main model landing page URL
 * @property {string|null} [summary] - Machine summary/specs
 * @property {ManufacturerBomPartRow[]} parts - The extracted BOM rows
 * @property {Object} coverage
 * @property {number} coverage.sectionsDiscovered
 * @property {number} coverage.sectionsFetched
 * @property {number} coverage.sectionFetchFailures
 * @property {boolean} coverage.paginationComplete
 * @property {string[]} coverage.flags
 */

export const EMPTY_BOM_RESULT = (label = 'Unknown') => ({
  truthSource: `${label} manufacturer catalog`,
  sourceStrategy: 'manufacturer-missing',
  parts: [],
  coverage: {
    sectionsDiscovered: 0,
    sectionsFetched: 0,
    sectionFetchFailures: 0,
    paginationComplete: false,
    flags: ['manufacturer-missing'],
  },
});
