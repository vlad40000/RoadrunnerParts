import fs from 'fs';
import dotenv from 'dotenv';
import { EbayAgentService } from '../src/features/ebay/services/ebay-agent-service';

dotenv.config({ path: '.env.local' });
dotenv.config();

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }),
);

function loadWorkflowParts(filePath = 'WORKFLOW_STATE.md') {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^W[A-Z0-9]+\s+/.test(line))
    .map((line) => {
      const match = line.match(/^(\S+)\s+(.+?)\s+(\S+)$/);
      if (!match) {
        throw new Error(`Could not parse workflow part row: ${line}`);
      }
      return {
        partNumber: match[1].trim(),
        partTitle: match[2].trim(),
        diagramId: match[3].trim(),
      };
    });

  if (!rows.length) {
    throw new Error(`No part rows found in ${filePath}`);
  }

  return rows;
}

const inputPath = String(args.get('input') || 'WORKFLOW_STATE.md');
const outputPath = String(args.get('output') || 'scratch/ge_dryer_listings.json');
const limitArg = args.get('limit');
const dryRun = args.get('dry-run') === 'true';
const parts = loadWorkflowParts(inputPath).slice(0, limitArg ? Number(limitArg) : undefined);
const apiKey = process.env.GEMINI_API_KEY;

async function main() {
  if (dryRun) {
    console.log(`Loaded ${parts.length} GE dryer parts from ${inputPath}.`);
    console.log(`First: ${parts[0]?.partNumber} | ${parts[0]?.partTitle} | ${parts[0]?.diagramId}`);
    console.log(`Last: ${parts.at(-1)?.partNumber} | ${parts.at(-1)?.partTitle} | ${parts.at(-1)?.diagramId}`);
    return;
  }

  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY in environment');
    process.exit(1);
  }

  const service = new EbayAgentService(apiKey);

  console.log(`Starting agentic processing for ${parts.length} GE dryer parts from ${inputPath}...`);
  const results = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    console.log(`[${i + 1}/${parts.length}] Researching ${part.partNumber}: ${part.partTitle}...`);
    try {
      const listing = await service.generateListing(part);
      if (listing) {
        results.push(listing);
        console.log(`Generated listing for ${part.partNumber}`);
      } else {
        console.warn(`Failed to generate listing for ${part.partNumber}`);
      }
    } catch (err) {
      console.error(`Error processing ${part.partNumber}:`, err);
    }
    // Delay to reduce API burst risk during full-list runs.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`\nDone. Processed ${results.length} listings.`);
  console.log(`Results saved to ${outputPath}`);
}

main().catch(console.error);
