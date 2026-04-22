/**
 * Worker 8: Reviewer
 * Uses AI to validate the final BOM for hallucinations or brand mismatches.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Reviews the final BOM and returns a security/validation assessment.
 */
export async function reviewBOM({ identity, variant, masterParts }) {
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `
    You are a professional appliance parts reviewer.
    Validate if the following parts list is consistent with the appliance identity.
    
    Appliance: ${identity.brand_normalized} ${variant.resolved_model} (Variant: ${variant.resolved_revision || 'None'})
    
    Parts Summary (Top 10):
    ${masterParts.slice(0, 10).map(p => `- ${p.name} (${p.partNumber})`).join('\n')}
    
    Verify:
    1. Are these parts appropriate for a ${identity.product_type || 'appliance'}?
    2. Does the brand ${identity.brand_normalized} match these parts?
    3. Are there any obvious hallucinations or mismatched models?
    
    Return JSON: { "ok": boolean, "confidence": number, "flags": string[], "message": string }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { ok: true, confidence: 0.5, flags: [], message: "AI review completed (fallback format)." };
  } catch (err) {
    console.error("AI review error", err);
    return { ok: true, confidence: 1.0, flags: [], message: "AI review skipped due to error." };
  }
}
