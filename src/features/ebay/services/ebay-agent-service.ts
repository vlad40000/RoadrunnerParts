import { GoogleGenerativeAI } from "@google/generative-ai";
import { MAY7_ROADRUNNER_EBAY_LISTING_PROMPT } from "../../bom/prompts/may7-rld-prompts";
import {
  agenticListingEnvelopeSchema,
  agenticListingRequestSchema,
  type AgenticListingRequest,
  type AgenticListingResult,
} from "../schemas";

const EBAY_AGENT_MODEL = "gemini-3.1-flash-lite";

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? text;
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }

  return JSON.parse(jsonText.slice(start, end + 1));
}

export class EbayAgentService {
  private model: any;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for EbayAgentService");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: EBAY_AGENT_MODEL,
      tools: [{ googleSearch: {} }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    } as any);
  }

  async generateListing(req: AgenticListingRequest): Promise<AgenticListingResult | null> {
    const parsedReq = agenticListingRequestSchema.parse(req);
    const searchPattern = `${parsedReq.partNumber} ${parsedReq.partTitle} Diag ID ${parsedReq.diagramId} product description and specs`;
    
    const prompt = `
${MAY7_ROADRUNNER_EBAY_LISTING_PROMPT}

INPUT ROWS
- Part Number: ${parsedReq.partNumber}
- Part Title: ${parsedReq.partTitle}
- Diagram ID: ${parsedReq.diagramId}

SEARCH METHOD
Use Google Search with this exact pattern: "${searchPattern}"
Use the top results to extract specifications and write a professional description.
If the source evidence does not support compatibility, dimensions, OEM status, or substitutions, leave those details out.
`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      const parsed = agenticListingEnvelopeSchema.parse(extractJsonObject(responseText));
      const listing = parsed.listings[0];
      
      if (!listing) return null;

      if (listing.partNumber !== parsedReq.partNumber) {
        console.warn(`Part number mismatch: expected ${parsedReq.partNumber}, got ${listing.partNumber}`);
        return null;
      }

      return listing;
    } catch (err) {
      console.error(`EbayAgentService failed for ${parsedReq.partNumber}:`, err);
      return null;
    }
  }

  async batchGenerate(requests: AgenticListingRequest[]): Promise<AgenticListingResult[]> {
    const results: AgenticListingResult[] = [];
    for (const req of requests) {
      const res = await this.generateListing(req);
      if (res) results.push(res);
      // Small delay between requests to be polite to APIs
      await new Promise(r => setTimeout(r, 500));
    }
    return results;
  }
}
