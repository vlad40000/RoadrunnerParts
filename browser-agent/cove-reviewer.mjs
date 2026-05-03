import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildCoveReviewerPrompt } from './cove-reviewer-prompt.mjs';

function uniqueSections(parts = []) {
  return [
    ...new Set(
      parts
        .map((part) => String(part.sectionName || part.section || '').trim())
        .filter(Boolean),
    ),
  ];
}

function sampleRows(parts = []) {
  return parts.slice(0, 80).map((part) => ({
    section: part.sectionName || part.section || null,
    partNumber: part.rawPartNumber || part.partNumber || null,
    description: part.rawPartName || part.partName || part.description || null,
  }));
}

function fallbackReview({ cove }) {
  if (!cove?.targetCount) {
    return {
      coverageAssessment: 'unknown',
      missingSystems: [],
      conditionalSystems: [],
      reviewNotes: ['No provider target count was available; CoVe reviewer skipped model-based coverage judgment.'],
    };
  }

  if (cove.status === 'MATCH' || cove.status === 'OVER_COUNT') {
    return {
      coverageAssessment: cove.status === 'MATCH' ? 'complete' : 'near_complete',
      missingSystems: [],
      conditionalSystems: [],
      reviewNotes: [`Count-based CoVe status is ${cove.status}.`],
    };
  }

  return {
    coverageAssessment: 'partial',
    missingSystems: cove.missingHints.map((hint) => ({
      system: hint,
      reason: 'This appliance-area hint was not represented in extracted section names.',
      confidence: 0.4,
      recommendedAction: `Re-scan provider diagrams or captured JSON for ${hint}.`,
    })),
    conditionalSystems: [],
    reviewNotes: [`Count-based CoVe shortfall is ${cove.shortfall ?? 'unknown'} parts.`],
  };
}

export async function runCoveReviewer({
  model,
  applianceType,
  expectedPartsTotal,
  parts = [],
  cove,
  useGemini = false,
}) {
  if (!useGemini || !process.env.GEMINI_API_KEY) {
    return fallbackReview({ cove });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const reviewerModel = genAI.getGenerativeModel({
    model: process.env.BROWSER_AGENT_REVIEWER_MODEL || 'gemini-3-flash-preview',
  });

  const prompt = buildCoveReviewerPrompt({
    applianceType,
    model,
    expectedPartsTotal,
    extractedCount: cove?.extractedCount ?? parts.length,
    sectionsFound: uniqueSections(parts),
    samplePartRows: sampleRows(parts),
  });

  try {
    const result = await reviewerModel.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  } catch (err) {
    return {
      ...fallbackReview({ cove }),
      reviewNotes: [
        ...fallbackReview({ cove }).reviewNotes,
        `Gemini CoVe reviewer failed: ${err.message}`,
      ],
    };
  }
}
