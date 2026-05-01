import fs from 'fs';
import path from 'path';

// Load legacy BOMs
const legacyBomsFile = 'C:/Users/bradv/.gemini/antigravity/brain/af89ce84-dbec-422f-9140-cb4258c61435/.system_generated/steps/526/output.txt';
const legacyBoms = JSON.parse(fs.readFileSync(legacyBomsFile, 'utf8'));

// Load partsData
const partsDataFile = 'c:/Users/bradv/Downloads/RoadrunnerParts-main (3)/RoadrunnerParts-main/src/partsData.ts';
let partsDataRaw = fs.readFileSync(partsDataFile, 'utf8');

partsDataRaw = partsDataRaw.replace(/export interface Part \{[\s\S]*?\}/, '');
partsDataRaw = partsDataRaw.replace(/export const partsData: Part\[\] =/, 'const partsData =');
partsDataRaw = partsDataRaw.replace(/export /g, '');

const partsData = eval(partsDataRaw + '; partsData;');

let sqlLines = [];

// 1. Model Resolution
const allModels = new Set();
legacyBoms.forEach(b => { if (b.model) allModels.add(b.model); });
partsData.forEach(p => { if (p.compatibleModels) p.compatibleModels.forEach(m => { if (m) allModels.add(m); }); });

for (const model of allModels) {
    if (model === 'Universal') continue;
    sqlLines.push(`INSERT INTO model_resolution (raw_model, canonical_model) VALUES ('${model}', '${model}') ON CONFLICT DO NOTHING;`);
}

// 2. Model Parts Raw & Master
for (const bom of legacyBoms) {
    if (!bom.parts) continue;
    for (const part of bom.parts) {
        const pJson = JSON.stringify(part).replace(/'/g, "''");
        sqlLines.push(`INSERT INTO model_parts_raw (canonical_model, source, section_name, raw_part_number, raw_part_name, raw_payload) VALUES ('${bom.model}', '${part.priceSource || 'Legacy'}', '${part.section}', '${part.partNumber}', '${part.description.replace(/'/g, "''")}', '${pJson}') ON CONFLICT DO NOTHING;`);
        sqlLines.push(`INSERT INTO model_parts_master (canonical_model, canonical_part_number, canonical_part_name, normalized_section) VALUES ('${bom.model}', '${part.partNumber}', '${part.description.replace(/'/g, "''")}', '${part.section}') ON CONFLICT (canonical_model, canonical_part_number) DO NOTHING;`);
    }
}

// 3. Cache tables
for (const bom of legacyBoms) {
    if (!bom.parts || bom.parts.length === 0) continue;
    const partsJson = JSON.stringify(bom.parts).replace(/'/g, "''");
    const normalizedModel = bom.model.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    sqlLines.push(`INSERT INTO model_parts_cache (id, normalized_model, parts, is_exhaustive, msrp) VALUES ('${normalizedModel}', '${normalizedModel}', '${partsJson}', 'true', ${bom.msrp ? `'${bom.msrp}'` : 'NULL'}) ON CONFLICT (normalized_model) DO UPDATE SET parts = EXCLUDED.parts, is_exhaustive = 'true';`);
    sqlLines.push(`INSERT INTO appliance_parts_cache (normalized_model, raw_model, parts_json, summary) VALUES ('${normalizedModel}', '${bom.model}', '${partsJson}', 'Legacy imported BOM') ON CONFLICT (normalized_model) DO UPDATE SET parts_json = EXCLUDED.parts_json;`);
}

// Write in chunks of 100
const chunkSize = 100;
for (let i = 0; i < sqlLines.length; i += chunkSize) {
    const chunk = sqlLines.slice(i, i + chunkSize).join('\n');
    fs.writeFileSync(`seed_chunk_${Math.floor(i/chunkSize)}.sql`, chunk);
}

console.log(`Generated ${Math.ceil(sqlLines.length / chunkSize)} chunk files.`);
