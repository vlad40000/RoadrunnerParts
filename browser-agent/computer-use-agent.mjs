import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * GEMINI COMPUTER USE AGENT (PROTOTYPE)
 * 
 * Implements the "Computer Use" loop for visual BOM extraction.
 * Bypasses 403 blocks by behaving like a visual human operator.
 */

// 1. Screen Dimensions (Standardized for CU model)
const SCREEN_WIDTH = 1440;
const SCREEN_HEIGHT = 900;

// Behavioral Jitter Config
const MIN_JITTER = 500;
const MAX_JITTER = 2000;

const GENERIC_BLOCK_RE = /(403|429|forbidden|access denied|request blocked|unusual traffic|verify you are human|captcha|temporarily unavailable|rate limit|too many requests)/i;

const PROVIDER_BLOCK_RULES = [
  {
    provider: 'encompass',
    host: /(^|\.)encompass\.com$/i,
    indicators: /(403|forbidden|access denied|request blocked|verify you are human|captcha|cloudflare|temporarily unavailable|too many requests)/i,
  },
  {
    provider: 'sears-partsdirect',
    host: /(^|\.)searspartsdirect\.com$/i,
    indicators: /(403|forbidden|access denied|robot|verify|captcha|too many requests|request blocked)/i,
  },
  {
    provider: 'appliancepartspros',
    host: /(^|\.)appliancepartspros\.com$/i,
    indicators: /(403|forbidden|access denied|captcha|request blocked|temporarily unavailable|too many requests)/i,
  },
  {
    provider: 'fix.com',
    host: /(^|\.)fix\.com$/i,
    indicators: /(403|forbidden|access denied|captcha|request blocked|too many requests)/i,
  },
];

class ComputerUseAgent {
  constructor(apiKey, options = {}) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
    });
    this.jobId = options.jobId || process.env.ROADRUNNER_JOB_ID || null;
    this.slotId = options.slotId || process.env.ROADRUNNER_SLOT_ID || null;
    this.appUrl = options.appUrl || process.env.ROADRUNNER_APP_URL || null;
    this.modelNumber = options.model || null;
    this.headful = Boolean(options.headful || process.env.CU_AGENT_HEADFUL === '1');
    this.keepOpen = Boolean(options.keepOpen || process.env.CU_AGENT_KEEP_OPEN === '1');
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async telemetry(event, status, payload = {}) {
    if (!this.jobId || !this.appUrl) return null;
    try {
      const res = await fetch(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          status,
          model: this.modelNumber,
          slotId: this.slotId,
          payload,
        }),
      });
      const data = await res.json().catch(() => null);
      return data?.telemetry || null;
    } catch (err) {
      console.warn(`[CU Agent] Telemetry failed for ${event}:`, err.message);
      return null;
    }
  }

  async waitForConfirmation(targetTelemetryId, timeoutMs = 300000) {
    if (!this.jobId || !this.appUrl || !targetTelemetryId) return 'timeout';

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const url = new URL(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}/telemetry`);
        url.searchParams.set('limit', '50');
        if (this.slotId) url.searchParams.set('slotId', this.slotId);
        const res = await fetch(url.toString());
        const data = await res.json().catch(() => null);
        const events = Array.isArray(data?.telemetry) ? data.telemetry : [];
        const updatedTarget = events.find((event) => event.id === targetTelemetryId);
        if (updatedTarget?.status === 'approved' || updatedTarget?.status === 'confirmed') return 'approved';
        if (updatedTarget?.status === 'rejected') return 'rejected';

        const decision = events.find(
          (event) =>
            event.event === 'operator_decision' &&
            event.payload?.targetTelemetryId === targetTelemetryId,
        );
        if (decision?.status === 'approved' || decision?.status === 'confirmed') return 'approved';
        if (decision?.status === 'rejected') return 'rejected';
      } catch (err) {
        console.warn('[CU Agent] Confirmation poll failed:', err.message);
      }
    }

    return 'timeout';
  }

  detectProviderBlock(url, pageTitle, pageText = '') {
    const safeUrl = String(url || '');
    let host = '';
    try {
      host = new URL(safeUrl).hostname.toLowerCase();
    } catch {
      host = '';
    }

    const haystack = `${pageTitle || ''}\n${pageText || ''}`;
    const providerRule = PROVIDER_BLOCK_RULES.find((rule) => rule.host.test(host));
    const providerHit = providerRule ? providerRule.indicators.test(haystack) : false;
    const genericHit =
      GENERIC_BLOCK_RE.test(pageTitle || '') ||
      GENERIC_BLOCK_RE.test(pageText || '') ||
      /\/(403|forbidden|access-denied|blocked)(\/|$|\?)/i.test(safeUrl);

    if (!providerHit && !genericHit) {
      return null;
    }

    return {
      provider: providerRule?.provider || host || 'unknown_provider',
      host: host || null,
      url: safeUrl,
      reason: providerHit ? 'provider_block_signature' : 'generic_block_signature',
      title: String(pageTitle || '').slice(0, 220),
      textSnippet: String(pageText || '').replace(/\s+/g, ' ').slice(0, 500),
    };
  }

  async jitter(min = MIN_JITTER, max = MAX_JITTER) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async checkForInstructionUpdates() {
    if (!this.jobId || !this.appUrl) return null;
    try {
      const url = new URL(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}/telemetry`);
      url.searchParams.set('limit', '20');
      if (this.slotId) url.searchParams.set('slotId', this.slotId);
      const res = await fetch(url.toString());
      const data = await res.json().catch(() => null);
      const events = Array.isArray(data?.telemetry) ? data.telemetry : [];
      
      // Look for the latest instruction update that isn't processed
      const update = events.find((t) => t.event === 'cu_instruction_update' && t.status === 'new');
      if (update) {
        console.log('[CU Agent] Received new instruction:', update.payload?.instruction);
        await this.telemetry('cu_instruction_update', 'processed', { originalId: update.id });
        return update.payload?.instruction;
      }
    } catch (err) {
      console.warn('[CU Agent] Instruction poll failed:', err.message);
    }
    return null;
  }

  async requestManualGate(context = {}) {
    if (!this.jobId || !this.appUrl) return;
    console.log('[CU Agent] Requesting Manual Gate (HITL)...');
    try {
      await this.telemetry('cu_manual_gate', 'pending_operator', {
        requestedAt: new Date().toISOString(),
        ...context,
      });
      await fetch(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requiresApproval: true,
          approvalStatus: 'pending_operator',
          ...context,
        }),
      });
    } catch (err) {
      console.warn('[CU Agent] Failed to request manual gate:', err.message);
    }
  }

  async saveAgentInstruction(instruction, context = {}) {
    if (!this.jobId || !this.appUrl) return { error: 'Missing jobId or appUrl' };
    console.log('[CU Agent] Saving Self-Correcting Instruction:', instruction);
    try {
      // 1. Post to telemetry for real-time dashboard updates
      await this.telemetry('cu_instruction_update', 'new', {
        instruction,
        source: 'agent_self_correction',
        ...context,
      });

      // 2. Persist to job record for long-term stack consistency
      await fetch(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}/instructions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, append: true }),
      });

      return { success: true };
    } catch (err) {
      console.warn('[CU Agent] Failed to save instruction:', err.message);
      return { error: err.message };
    }
  }

  async waitForManualApproval(timeoutMs = 3600000) { // 1 hour default for human
    if (!this.jobId || !this.appUrl) return 'approved';

    console.log('[CU Agent] Entering Manual Gate wait loop...');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await fetch(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}`);
        const data = await res.json().catch(() => null);
        const job = data?.job;
        const approvalStatus = String(job?.approvalStatus || '').trim().toLowerCase();

        if (approvalStatus === 'approved' || approvalStatus === 'rejected') {
          console.log(`[CU Agent] Manual Gate: ${approvalStatus.toUpperCase()}`);
          return approvalStatus;
        }

        if (job?.requiresApproval === false && !approvalStatus) {
          // Backward compatibility for early rows where only requiresApproval was toggled.
          console.log('[CU Agent] Manual Gate cleared without explicit status. Continuing.');
          return 'approved';
        }
      } catch (err) {
        console.warn('[CU Agent] Manual approval poll failed:', err.message);
      }
    }
    return 'timeout';
  }

  // 2. Coordinate Translation
  denormalizeX(x) { return Math.round((x / 1000) * SCREEN_WIDTH); }
  denormalizeY(y) { return Math.round((y / 1000) * SCREEN_HEIGHT); }

  async init() {
    console.log('[CU Agent] Initializing Playwright browser...');
    await this.telemetry('cu_agent_init', 'running', { viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } });
    this.browser = await chromium.launch({ headless: !this.headful });
    this.context = await this.browser.newContext({
      viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }
    });
    this.page = await this.context.newPage();
  }

  async close() {
    if (this.keepOpen) return;
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
  }

  async captureState() {
    const screenshot = await this.page.screenshot({ type: 'png' });
    return {
      screenshot: screenshot.toString('base64'),
      url: this.page.url()
    };
  }

  async executeAction(action) {
    const { name, args } = action;
    console.log(`[CU Agent] Executing: ${name}`, args);

    try {
      // Apply behavioral jitter before every action
      await this.jitter();

      switch (name) {
        case 'open_web_browser':
          // Already handled in init/goto
          break;
        case 'navigate':
          await this.page.goto(args.url, { waitUntil: 'domcontentloaded' });
          break;
        case 'click_at':
          const cx = this.denormalizeX(args.x);
          const cy = this.denormalizeY(args.y);
          // Human-like mouse movement
          await this.page.mouse.move(cx, cy, { steps: 10 });
          await this.page.mouse.click(cx, cy);
          break;
        case 'type_text_at':
          const tx = this.denormalizeX(args.x);
          const ty = this.denormalizeY(args.y);
          await this.page.mouse.move(tx, ty, { steps: 10 });
          await this.page.mouse.click(tx, ty);
          
          // Clear field with jitter
          await this.page.keyboard.press('Control+A');
          await this.jitter(100, 300);
          await this.page.keyboard.press('Backspace');
          await this.jitter(100, 500);

          // Type with individual key delays
          for (const char of args.text) {
            await this.page.keyboard.type(char, { delay: Math.random() * 80 + 20 });
          }
          
          if (args.press_enter !== false) {
            await this.jitter(200, 600);
            await this.page.keyboard.press('Enter');
          }
          break;
        case 'scroll_document':
          const scrollMap = { 'up': -800, 'down': 800, 'left': -800, 'right': 800 };
          const dist = scrollMap[args.direction] || 800;
          // Smooth scroll jitter
          for (let s = 0; s < 5; s++) {
            await this.page.mouse.wheel(0, dist / 5);
            await this.jitter(50, 150);
          }
          break;
        case 'wait_5_seconds':
          await new Promise(r => setTimeout(r, 5000));
          break;
        case 'save_agent_instruction':
          return await this.saveAgentInstruction(args.instruction, args.context || {});
        case 'request_manual_gate':
          await this.requestManualGate({ reason: args.reason, ...args.context });
          const decision = await this.waitForManualApproval();
          return { success: decision === 'approved', decision };
        default:
          console.warn(`[CU Agent] Unknown or unimplemented action: ${name}`);
      }
      
      // Post-action stabilization
      await this.page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[CU Agent] Action failed: ${name}`, err);
      return { error: err.message };
    }
    return { success: true };
  }

  async run(goal, initialUrl = 'https://www.google.com') {
    await this.telemetry('cu_agent_start', 'running', { goal, initialUrl });
    try {
      await this.init();
      await this.page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      let history = [
        {
          role: 'user',
          parts: [
            { text: goal }
          ]
        }
      ];

      const turnLimit = 10;
      for (let i = 0; i < turnLimit; i++) {
      console.log(`\n--- [CU Agent] Turn ${i + 1} ---`);

      // 0. Check for mid-session instruction updates
      const newInstruction = await this.checkForInstructionUpdates();
      if (newInstruction) {
        history.push({
          role: 'user',
          parts: [{ text: `NEW OPERATOR INSTRUCTION: ${newInstruction}\nPlease adjust your plan according to this new information.` }]
        });
        // Reset turn limit if new instruction received? Or just continue.
      }
      
      // 1. HITL Gate Check
      try {
        const res = await fetch(`${this.appUrl}/api/bom/jobs/${encodeURIComponent(this.jobId)}`);
        const data = await res.json().catch(() => null);
        const approvalStatus = String(data?.job?.approvalStatus || '').trim().toLowerCase();
        if (data?.job?.requiresApproval || approvalStatus === 'pending' || approvalStatus === 'pending_operator') {
          const decision = await this.waitForManualApproval();
          if (decision === 'rejected') {
            console.log('[CU Agent] Job rejected by operator. Terminating.');
            break;
          }
        }
      } catch (err) {
        console.warn('[CU Agent] Pre-turn gate check failed:', err.message);
      }

      // 2. Automated Block Detection
      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();
      const pageText = await this.page
        .evaluate(() => (document?.body?.innerText || '').slice(0, 4000))
        .catch(() => '');
      const blockInfo = this.detectProviderBlock(currentUrl, pageTitle, pageText);

      if (blockInfo) {
        console.log(`[CU Agent] Provider block suspected on ${currentUrl}. Analyzing visually...`);
        // Instead of immediate gate, we inject a prompt for the model to analyze the block
        history.push({
          role: 'user',
          parts: [{ text: `I detected a possible security block or interceptor: ${blockInfo.reason} from ${blockInfo.provider}. 
Please look at the screenshot. 
- If it is a CAPTCHA or Cloudflare Challenge that requires human interaction, use the 'request_manual_gate' tool (once implemented) or just state that you need a human.
- If it is just a popup, modal, or simple 'Close' button, use 'computer_use' to navigate past it.
- If you can derive a rule to avoid this in the future, use 'save_agent_instruction'.` }]
        });
      }
      const state = await this.captureState();
      await this.telemetry('cu_screenshot', 'running', {
        turn: i + 1,
        url: state.url,
        screenshot: state.screenshot,
      });
      
      // Inject current visual state into the last user message or add new one
      history[history.length - 1].parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: state.screenshot
        }
      });

      // Note: This is a speculative implementation of the tool config for JS SDK
      // as the exact beta/preview syntax for Node.js may vary from the Python reference.
      const result = await this.model.generateContent({
        contents: history,
        tools: [
          {
            //@ts-ignore - Preview feature
            computer_use: {
              environment: 'ENVIRONMENT_BROWSER'
            }
          },
          {
            functionDeclarations: [
              {
                name: 'save_agent_instruction',
                description: 'Persists a new behavioral instruction for self-correction during visual loop recovery (e.g. "Wait for element .captcha-overlay to disappear").',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    instruction: { type: 'STRING', description: 'The new instruction text.' },
                    context: { type: 'OBJECT', description: 'Optional metadata about why this instruction is needed.' }
                  },
                  required: ['instruction']
                }
              },
              {
                name: 'request_manual_gate',
                description: 'Triggers a Human-in-the-Loop (HITL) gate in the cockpit, pausing the agent until an operator approves or solves a challenge (e.g. CAPTCHA).',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    reason: { type: 'STRING', description: 'The reason for the manual gate.' },
                    context: { type: 'OBJECT', description: 'Metadata about the block.' }
                  },
                  required: ['reason']
                }
              }
            ]
          }
        ],
        // Required for Computer Use loops to allow the model to think before acting
        generationConfig: {
          temperature: 1.0,
          topP: 0.95,
        }
      });

      const response = result.response;
      const candidate = response.candidates[0];
      const message = candidate.content;
      
      history.push(message);

      const functionCalls = message.parts.filter(p => p.functionCall).map(p => p.functionCall);
      
      if (functionCalls.length === 0) {
        const text = message.parts.map(p => p.text).join(' ');
        console.log(`[CU Agent] Finished: ${text}`);
        break;
      }

      const functionResponses = [];
      for (const fc of functionCalls) {
        const safetyDecision = fc.args?.safety_decision;
        if (safetyDecision?.decision === 'require_confirmation') {
          const confirmationEvent = await this.telemetry('cu_action', 'require_confirmation', {
            turn: i + 1,
            name: fc.name,
            args: fc.args,
            explanation: safetyDecision.explanation || 'Operator confirmation required before executing this action.',
          });
          const decision = await this.waitForConfirmation(confirmationEvent?.id);
          if (decision !== 'approved') {
            functionResponses.push({
              functionResponse: {
                name: fc.name,
                response: {
                  url: this.page.url(),
                  blocked: true,
                  decision,
                }
              }
            });
            await this.telemetry('cu_action', decision === 'rejected' ? 'failed' : 'timeout', {
              turn: i + 1,
              name: fc.name,
              args: fc.args,
              decision,
            });
            continue;
          }
        }

        await this.telemetry('cu_action', 'executing', {
          turn: i + 1,
          name: fc.name,
          args: fc.args,
        });
        const executionResult = await this.executeAction(fc);
        await this.telemetry('cu_action', executionResult.error ? 'failed' : 'complete', {
          turn: i + 1,
          name: fc.name,
          args: fc.args,
          result: executionResult,
        });
        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: {
              url: this.page.url(),
              ...executionResult
            }
          }
        });
      }

      history.push({
        role: 'user',
        parts: functionResponses
      });
    }

      await this.telemetry('cu_agent_finished', 'complete', { url: this.page?.url() || null });
    } finally {
      await this.close();
    }
  }
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

// CLI Execution Example:
// node browser-agent/computer-use-agent.mjs "Search Encompass for Whirlpool model WDF520PADM, navigate to the Exploded View, and list the price of the Dishrack."
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  const positionalGoal = process.argv.slice(2).filter((item) => !item.startsWith('--')).join(' ');
  const goal = args.goal || positionalGoal || "Go to encompass.com and search for model WDF520PADM";
  const agent = new ComputerUseAgent(process.env.GEMINI_API_KEY, {
    jobId: args.jobId,
    slotId: args.slotId,
    appUrl: args.appUrl,
    model: args.model,
    headful: Boolean(args.headful),
    keepOpen: Boolean(args.keepOpen),
  });
  agent.run(goal, args.url || 'https://encompass.com').catch(async (err) => {
    console.error(err);
    await agent.telemetry('cu_agent_failed', 'failed', { error: err.message });
    await agent.close();
  });
}

export { ComputerUseAgent };
