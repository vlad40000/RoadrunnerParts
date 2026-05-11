import { NextResponse } from "next/server";
import {
  DEFAULT_GEMINI_TEXT_MODEL,
  isGeminiImageGenerationModel,
  normalizeGeminiModelId,
  runStructuredJson,
} from "../../../../../src/features/bom/services/model-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanModel(value) {
  const requestedModel = cleanText(value, 120);
  const normalizedModel = normalizeGeminiModelId(requestedModel);
  if (isGeminiImageGenerationModel(normalizedModel)) {
    return {
      requestedModel: requestedModel || normalizedModel,
      model: DEFAULT_GEMINI_TEXT_MODEL,
      warnings: [`${normalizedModel} is image-workflow only for this editor action. Used ${DEFAULT_GEMINI_TEXT_MODEL} for text JSON generation.`],
    };
  }
  return {
    requestedModel: requestedModel || normalizedModel,
    model: normalizedModel,
    warnings: requestedModel && requestedModel !== normalizedModel ? [`Normalized model ${requestedModel} to ${normalizedModel}.`] : [],
  };
}

function safeListingPayload(value) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    title: cleanText(data.title, 220),
    description: cleanText(data.description, 4000),
    condition: cleanText(data.condition, 120),
    price: cleanText(data.ebayBuyNow || data.price, 80),
    specs: data.specs && typeof data.specs === "object" ? data.specs : {},
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const type = cleanText(body.type, 40);
    const partNumber = cleanText(body.partNumber, 80).toUpperCase();
    const modelSelection = cleanModel(body.modelName || body.model);
    const model = modelSelection.model;
    const currentData = safeListingPayload(body.currentData);

    if (!type || !partNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (type === "description") {
      const edit = await runStructuredJson({
        model,
        temperature: 1,
        topP: 0.8,
        maxOutputTokens: 1200,
        systemInstruction:
          "You are a RoadrunnerParts office-editor assistant. Return JSON only. You help draft editable eBay listing fields, but you do not create source evidence or final posting truth.",
        prompt: [
          "Rewrite the listing description for this used appliance part.",
          "",
          "Hard rules:",
          "- Do not claim tested, genuine, OEM, guaranteed, new, or compatible with specific models unless already present in the input.",
          "- Do not invent condition details, included hardware, fitment, test results, or image evidence.",
          "- Keep it concise, professional, and suitable for an eBay used-parts listing.",
          "- Return JSON with only: descriptionText, rationale, warnings.",
          "",
          `Part number: ${partNumber}`,
          `Current listing JSON: ${JSON.stringify(currentData)}`,
        ].join("\n"),
      });

      return NextResponse.json({
        result: cleanText(edit.descriptionText || currentData.description, 4000),
        model,
        requestedModel: modelSelection.requestedModel,
        warnings: [...modelSelection.warnings, ...(Array.isArray(edit.warnings) ? edit.warnings : [])],
      });
    }

    if (type === "specs") {
      const result = await runStructuredJson({
        model,
        temperature: 1,
        topP: 0.8,
        maxOutputTokens: 900,
        systemInstruction:
          "You are a RoadrunnerParts office-editor assistant. Return JSON only. You normalize operator-supplied listing fields without inventing source evidence.",
        prompt: [
          "Normalize item specifics from the supplied listing only.",
          "",
          "Hard rules:",
          "- Use empty strings for unknown values.",
          "- Do not guess compatibility, material, condition, or brand beyond what the input supports.",
          "- Return JSON with keys: brand, mpn, type, color, material, compatibility, condition, warnings.",
          "",
          `Part number: ${partNumber}`,
          `Current listing JSON: ${JSON.stringify(currentData)}`,
        ].join("\n"),
      });

      return NextResponse.json({
        result: {
          brand: cleanText(result.brand, 160),
          mpn: cleanText(result.mpn || partNumber, 160),
          type: cleanText(result.type, 160),
          color: cleanText(result.color, 160),
          material: cleanText(result.material, 160),
          compatibility: cleanText(result.compatibility, 320),
          condition: cleanText(result.condition || currentData.condition, 160),
        },
        model,
        requestedModel: modelSelection.requestedModel,
        warnings: [...modelSelection.warnings, ...(Array.isArray(result.warnings) ? result.warnings : [])],
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "AI Generation Failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
