import { runFixComAgent } from './fix-com-agent.mjs';
import { runSearsAgent } from './sears-agent.mjs';
import { runEncompassSupervisor } from './encompass-supervisor.mjs';

function parseArgs(argv) {
  const args = {
    provider: 'fix',
    write: false,
    gemini: false,
    review: false,
    headful: false,
    supervisor: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (['write', 'gemini', 'review', 'headful', 'supervisor'].includes(key)) {
      args[key] = true;
      continue;
    }

    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = next;
    i += 1;
  }

  // Backward-compatible form: node agent.mjs <modelUrl> <modelName>
  if (positional.length >= 2 && !args.url && !args.model) {
    args.url = positional[0];
    args.model = positional[1];
  }

  return args;
}

function printUsage() {
  console.log(`
Usage:
  node agent.mjs --provider fix --brand GE --type dryer --model GTDX180ED3WW
  node agent.mjs --provider fix --url https://www.fix.com/models/dryer/ge/GTDX180ED3WW/ --model GTDX180ED3WW

Options:
  --supervisor Run Encompass Visual Supervisor first to establish truth.
  --write     Write extracted raw rows to Neon model_parts_raw.
  --gemini    Enable Gemini fallback parsing when deterministic extraction finds no rows.
  --review    Enable Gemini CoVe reviewer after source-backed extraction.
  --headful   Run Chromium with a visible browser window.
`.trim());
}

async function start() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.model && !args.url) {
    printUsage();
    process.exit(1);
  }

  let visualTruth = null;
  if (args.supervisor) {
    console.log(`[Agent] Establishing Visual Truth via Encompass...`);
    visualTruth = await runEncompassSupervisor({
      model: args.model,
      headless: !args.headful,
    });
  }

  if (!['fix', 'sears'].includes(args.provider)) {
    throw new Error(`Unsupported provider "${args.provider}". Supported: fix, sears.`);
  }

  const agentOptions = {
    modelUrl: args.url || null,
    model: args.model,
    brand: args.brand || null,
    productType: args.type || args.productType || null,
    write: Boolean(args.write),
    useGemini: Boolean(args.gemini),
    useReviewer: Boolean(args.review),
    headless: !args.headful,
    visualTruth, // Pass visual truth context to supplier agents
  };

  const result = args.provider === 'fix' 
    ? await runFixComAgent(agentOptions)
    : await runSearsAgent(agentOptions);

  console.log(JSON.stringify({
    status: result.cove.status,
    model: result.model,
    provider: result.provider,
    visualTruth: visualTruth ? {
      canonUrl: visualTruth.canonUrl,
      expectedTotal: visualTruth.expectedTotal,
      assemblyCount: visualTruth.assemblyNames.length,
    } : null,
    expectedPartsTotal: result.expectedPartsTotal,
    extractedCount: result.cove.extractedCount,
    targetCount: result.cove.targetCount,
    artifactPath: result.artifactPath,
    persisted: result.persisted,
    review: result.review?.coverageAssessment || null,
  }, null, 2));
}

start().catch((err) => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});
