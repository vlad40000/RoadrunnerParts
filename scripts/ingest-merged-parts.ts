import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in environment.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function ingestParts() {
  const jsonPath = path.resolve('C:/Users/bradv/Downloads/part_infos_merged.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: File not found at ${jsonPath}`);
    process.exit(1);
  }

  console.log('Loading JSON data...');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${data.length} parts.`);

  const modelNumber = 'Hotpoint Dryer';
  const source = 'manual_ingest';
  const sourceUrl = 'https://example.com/hotpoint-dryer'; // Placeholder

  // Group by diagram (file)
  const groups: Record<string, any[]> = {};
  for (const row of data) {
    const diagramName = row.file || 'merged_import';
    if (!groups[diagramName]) {
      groups[diagramName] = [];
    }
    groups[diagramName].push(row);
  }

  const diagramNames = Object.keys(groups);
  console.log(`Found ${diagramNames.length} unique diagrams.`);

  let totalIngested = 0;

  for (const diagramName of diagramNames) {
    console.log(`\nProcessing diagram: ${diagramName} (${groups[diagramName].length} parts)`);
    
    try {
      // 1. Ensure a session exists for this diagram
      const sessionResult = await sql`
        INSERT INTO bom_capture_session (source, source_url, model_number, diagram_name)
        VALUES (${source}, ${sourceUrl}, ${modelNumber}, ${diagramName})
        ON CONFLICT DO NOTHING
        RETURNING id;
      `;

      let sessionId = sessionResult[0]?.id;
      if (!sessionId) {
        const existingSession = await sql`
          SELECT id FROM bom_capture_session 
          WHERE source = ${source} AND model_number = ${modelNumber} AND diagram_name = ${diagramName}
          LIMIT 1;
        `;
        sessionId = existingSession[0]?.id;
      }

      if (!sessionId) {
        console.error(`Failed to create or find session for ${diagramName}. Skipping...`);
        continue;
      }

      // 2. Ingest parts for this diagram
      for (const row of groups[diagramName]) {
        const partNumber = row.part_number;
        const description = row.title;
        const callout = row.dia;
        const rawPrice = row.price;
        
        const dedupeKey = `${source}:${modelNumber}:${diagramName}:${callout}:${partNumber || 'no-part'}`.toLowerCase();

        await sql`
          INSERT INTO bom_captured_part (
            session_id, source, source_url, model_number, diagram_name, 
            callout, part_number, description, price, raw_text, dedupe_key
          )
          VALUES (
            ${sessionId}, ${source}, ${sourceUrl}, ${modelNumber}, ${diagramName},
            ${callout}, ${partNumber}, ${description}, ${rawPrice}, ${JSON.stringify(row)}, ${dedupeKey}
          )
          ON CONFLICT (dedupe_key) DO UPDATE SET
            price = EXCLUDED.price,
            description = EXCLUDED.description,
            raw_text = EXCLUDED.raw_text,
            updated_at = NOW();
        `;
        totalIngested++;
      }
      
      console.log(`Finished ${diagramName}. Total so far: ${totalIngested}`);
    } catch (error) {
      console.error(`Error processing diagram ${diagramName}:`, error);
    }
  }

  console.log(`\nCOMPLETED. Total parts processed: ${totalIngested}`);
}

ingestParts();
