import "server-only";

export type SearsPayloadKind = "model_resolver" | "model_detail" | "unknown";

export function classifySearsPayload(payload: any): SearsPayloadKind {
  if (!payload || typeof payload !== "object") return "unknown";
  
  const root = payload.ROOT_QUERY ?? {};

  // Pattern 1: Search results / Brand / Category listing
  const hasModelSearch = Object.keys(root).some((key) =>
    key.startsWith("models(")
  );

  // Pattern 2: Model Detail reference or actual model object
  const hasModelDetailRef = Object.keys(root).some((key) =>
    key.startsWith("model(")
  );

  const hasConcreteModelDetail = Object.values(payload).some((value: any) =>
    value?.__typename === "Model" &&
    value?.hasParts === true &&
    Object.keys(value).some((key) => key.startsWith("parts("))
  );

  if (hasConcreteModelDetail || hasModelDetailRef) return "model_detail";
  if (hasModelSearch) return "model_resolver";
  
  return "unknown";
}

export interface SearsResolverCandidate {
  modelId: string;
  modelNumber: string;
  brand: string;
  category: string;
  partCount: number;
  url: string;
}

export function extractSearsResolverCandidates(payload: any): SearsResolverCandidate[] {
  const candidates: SearsResolverCandidate[] = [];
  
  // Navigate the complex Sears Apollo payload to find the models list
  // Usually under ROOT_QUERY.models(...) or a specific search node
  Object.entries(payload).forEach(([key, value]: [string, any]) => {
    if (value?.__typename === "Model") {
      // Direct model objects found in the payload
      candidates.push({
        modelId: value.id || key,
        modelNumber: value.number || value.modelNumber || "Unknown",
        brand: value.brand?.name || "Unknown",
        category: value.category?.name || "Unknown",
        partCount: value.partCount || 0,
        url: `https://www.searspartsdirect.com/model/${value.id}`
      });
    }
  });

  // Dedupe and filter out non-essential nodes
  return candidates.filter((c, index, self) => 
    self.findIndex(t => t.modelId === c.modelId) === index && c.modelId
  );
}
