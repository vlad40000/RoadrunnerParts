
const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (may)\\RoadrunnerParts-main\\src\\features\\bom\\prompts\\parts.ts';
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
const dataLines = lines.slice(47); // Line 48 is index 47

const header = dataLines[0].trim().split('\t');
const records = [];

for (let i = 1; i < dataLines.length; i++) {
  const line = dataLines[i].trim();
  if (!line) continue;
  const values = line.split('\t');
  const record = {};
  header.forEach((key, index) => {
    record[key] = values[index] || '';
  });
  records.push(record);
}

const tsContent = `
export interface AssemblySeedRecord {
  brand_code: string;
  model: string;
  model_family: string;
  fuel_type: string;
  encompass_option_value: string;
  assembly_url: string;
  section_seq: string;
  section_label_raw: string;
  section_name_clean: string;
  normalized_section: string;
  section_family: string;
}

export const ASSEMBLY_SEED_DATA: AssemblySeedRecord[] = ${JSON.stringify(records, null, 2)};
`;

const outputDir = 'c:\\Users\\bradv\\Downloads\\RoadrunnerParts-main (may)\\RoadrunnerParts-main\\src\\features\\bom\\data';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(path.join(outputDir, 'assembly-seed.ts'), tsContent);
console.log('Successfully created assembly-seed.ts');
