import { bomResultSchema } from "../src/features/bom/schemas/bom";

export async function runEvaluatorTests(result: any) {
  const issues: string[] = [];

  // 1. JSON Schema Valid
  try {
    bomResultSchema.parse(result);
  } catch (err) {
    issues.push(`JSON Schema Invalid: ${err}`);
  }

  // 2. Exact Model Matched
  if (!result.model) {
    issues.push("Exact model NOT matched/extracted.");
  }

  // 3. Rows >= 40 unless confirmed smaller
  if (result.uniqueRowCount < 40 && !result.completionProof) {
    issues.push(`Unique row count (${result.uniqueRowCount}) < 40 without completion proof.`);
  }

  // 4. No Fake totalPartCount
  if (result.completionProof?.expectedPartCount === 0 && result.uniqueRowCount > 0) {
    issues.push("Fake totalPartCount: expected 0 but found rows.");
  }

  // 5. No "complete" if pagination incomplete
  if (result.status === "bom_complete" && result.completionProof && result.completionProof.coverageRatio < 0.9) {
     issues.push("Marked 'bom_complete' but coverage ratio < 0.9.");
  }

  // 6. No cached 0-row result
  if (result.uniqueRowCount === 0 && result.status !== "no_result") {
    issues.push("0-row result found but status is not 'no_result'.");
  }

  return {
    success: issues.length === 0,
    issues,
  };
}
