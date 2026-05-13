import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'edge';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * POST /api/identity/classify-image
 *
 * Classifies an appliance photo into one of:
 *   nameplate | interior | wiring | product | unknown
 *
 * Body: { imageBase64: string, mimeType: string }
 * Response: { classification: string }
 */
export async function POST(req: Request) {
  try {
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ classification: 'unknown' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const prompt = `You are an appliance image classifier. Classify this image into exactly one category:

- "nameplate"  — a data tag, model/serial label, or rating plate on an appliance
- "interior"   — the inside of an appliance (drum, tub, cavity, racks, shelving)
- "wiring"     — a wiring diagram, schematic, or electrical label
- "product"    — an exterior product shot of the whole appliance or a part
- "unknown"    — anything else

Reply with ONLY the single word category. No explanation, no punctuation.`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' } },
        ],
      }],
    });

    const raw = result.response.text().trim().toLowerCase().split(/\s+/)[0];
    const valid = ['nameplate', 'interior', 'wiring', 'product', 'unknown'];
    const classification = valid.includes(raw) ? raw : 'unknown';

    return NextResponse.json({ classification });
  } catch (err) {
    console.error('[classify-image]', err);
    // Fail open — caller defaults to nameplate (most common intent)
    return NextResponse.json({ classification: 'nameplate' });
  }
}
