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

class ComputerUseAgent {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-computer-use-preview-10-2025',
    });
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  // 2. Coordinate Translation
  denormalizeX(x) { return Math.round((x / 1000) * SCREEN_WIDTH); }
  denormalizeY(y) { return Math.round((y / 1000) * SCREEN_HEIGHT); }

  async init() {
    console.log('[CU Agent] Initializing Playwright browser...');
    this.browser = await chromium.launch({ headless: false }); // Headless: false for visual debugging
    this.context = await this.browser.newContext({
      viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }
    });
    this.page = await this.context.newPage();
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
      switch (name) {
        case 'open_web_browser':
          // Already handled in init/goto
          break;
        case 'navigate':
          await this.page.goto(args.url, { waitUntil: 'domcontentloaded' });
          break;
        case 'click_at':
          await this.page.mouse.click(this.denormalizeX(args.x), this.denormalizeY(args.y));
          break;
        case 'type_text_at':
          const x = this.denormalizeX(args.x);
          const y = this.denormalizeY(args.y);
          await this.page.mouse.click(x, y);
          // Clear field
          await this.page.keyboard.press('Control+A');
          await this.page.keyboard.press('Backspace');
          await this.page.keyboard.type(args.text);
          if (args.press_enter !== false) {
            await this.page.keyboard.press('Enter');
          }
          break;
        case 'scroll_document':
          const scrollMap = { 'up': -800, 'down': 800, 'left': -800, 'right': 800 };
          await this.page.mouse.wheel(0, scrollMap[args.direction] || 800);
          break;
        case 'wait_5_seconds':
          await new Promise(r => setTimeout(r, 5000));
          break;
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
    await this.init();
    await this.page.goto(initialUrl);

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
      
      const state = await this.captureState();
      
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
          }
        ],
        // Required for Computer Use loops to allow the model to think before acting
        generationConfig: {
          temperature: 0.1,
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
        const executionResult = await this.executeAction(fc);
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

    // Keep browser open for inspection if needed, otherwise:
    // await this.browser.close();
  }
}

// CLI Execution Example:
// node browser-agent/computer-use-agent.mjs "Search Encompass for Whirlpool model WDF520PADM, navigate to the Exploded View, and list the price of the Dishrack."
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const goal = process.argv.slice(2).join(' ') || "Go to encompass.com and search for model WDF520PADM";
  const agent = new ComputerUseAgent(process.env.GEMINI_API_KEY);
  agent.run(goal, 'https://encompass.com').catch(console.error);
}

export { ComputerUseAgent };
