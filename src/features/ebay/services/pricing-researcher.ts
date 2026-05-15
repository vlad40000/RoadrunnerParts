import { GoogleGenerativeAI } from "@google/generative-ai";
import { scheduleGeminiCall } from "../../../lib/gemini-call-scheduler";

export interface MarketSnapshot {
  medianSoldPrice: number;
  activeCount: number;
  soldCount: number;
  netExpected: number;
  confidence: number;
  citations: string[];
  lowestActivePrice?: number;
}

const MARKET_MODEL = process.env.MARKET_LITE_MODEL || process.env.GEMINI_LITE_MODEL || "gemini-3.1-flash-lite";

export class PricingResearcher {
  private model: any;

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: MARKET_MODEL,
      tools: [{ googleSearch: {} }]
    } as any);
  }

  async analyzePart(partNumber: string, partName: string): Promise<MarketSnapshot> {
    const prompt = `Perform a detailed market analysis for appliance part "${partNumber}" (${partName}).
    
    1. Search for "eBay Sold" listings for this exact part number to find the last 5-10 sales.
    2. Search for "eBay Active" listings to find current competition and the lowest "Buy It Now" price for a Used item.
    3. Search for retail prices on "PartsDr" or "Encompass" as a retail anchor.
    
    CRITICAL: Provide the URLs of the listings you found as citations.
    
    Calculate:
    - medianSoldPrice: The median of the sold items.
    - activeCount: Number of currently active listings.
    - soldCount: Number of items sold in the last 90 days.
    - lowestActivePrice: The lowest current price for a used item.
    - netExpected: (medianSoldPrice * 0.85) - 15 (estimated shipping/labor).
    - confidence: A score from 0-1 based on data availability.
    
    Return ONLY a JSON object:
    {
      "medianSoldPrice": number,
      "activeCount": number,
      "soldCount": number,
      "lowestActivePrice": number,
      "netExpected": number,
      "confidence": number,
      "citations": ["url1", "url2", ...]
    }`;

    try {
      const result = await scheduleGeminiCall({
        tool: "market",
        bucket: "lite",
        model: MARKET_MODEL,
        grounded: true,
        route: "PricingResearcher.analyzePart",
        requestId: partNumber,
        run: () => this.model.generateContent(prompt),
      });
      const response = await result.response;
      const text = response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error(`Error analyzing part ${partNumber}:`, error);
      throw error;
    }
  }
}
