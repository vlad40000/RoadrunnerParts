import "server-only";

export type SearsPayloadKind = "model_resolver" | "model_detail" | "unknown";

export interface SearsCatalogPart {
  diagramNumber: string;
  description: string;
  originalPartNumber: string;
  currentServicePartNumber: string;
  availability: string;
  replacementNote: string | null;
  price: number | null;
}

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

export function extractSearsCatalogPayload(html: string): any {
  if (!html) return null;
  const match = html.match(/window\.CATALOG_API_RESPONSE\s*=\s*({.*?});/s) ||
                html.match(/window\.__APOLLO_STATE__\s*=\s*({.*?});/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.error("[Sears Adapter] Failed to parse CATALOG_API_RESPONSE JSON:", err);
    return null;
  }
}

export function parseSearsCatalogModel(payload: any) {
  if (!payload) return null;
  const modelObj = Object.values(payload).find((v: any) => v?.__typename === "Model" && v?.number) as any;
  if (!modelObj) return null;
  
  return {
    id: modelObj.id,
    modelNumber: modelObj.number || modelObj.modelNumber,
    brand: modelObj.brand?.name || "Unknown",
    category: modelObj.category?.name || "Unknown",
    partCount: modelObj.partCount || 0,
    hasParts: modelObj.hasParts || false
  };
}

export function parseSearsModelSearchPayload(payload: any) {
  if (!payload) return [];
  const results: any[] = [];
  
  Object.values(payload).forEach((v: any) => {
    if (v?.__typename === "Model" && v?.number) {
      results.push({
        id: v.id,
        modelNumber: v.number,
        brand: v.brand?.name || "Unknown",
        category: v.category?.name || "Unknown",
        partCount: v.partCount || 0,
        url: `https://www.searspartsdirect.com/model/${v.id}`
      });
    }
  });

  return results.filter((m, i, self) => self.findIndex(t => t.id === m.id) === i);
}

export function parseSearsCatalogDiagrams(payload: any) {
  if (!payload) return [];
  const diagrams: any[] = [];

  Object.values(payload).forEach((v: any) => {
    if (v?.__typename === "Diagram") {
      diagrams.push({
        id: v.id,
        name: v.name,
        imageUrl: v.imageUrl,
        partCount: v.partCount || 0
      });
    }
  });

  return diagrams;
}

export function parseSearsCatalogParts(payload: any): SearsCatalogPart[] {
  if (!payload) return [];
  const parts: SearsCatalogPart[] = [];

  Object.values(payload).forEach((v: any) => {
    if (v?.__typename === "Part") {
      parts.push({
        diagramNumber: (v.keyNumber || v.diagramNumber || "0") as string,
        description: (v.description || v.name || "Appliance Part") as string,
        originalPartNumber: (v.partNumber || v.number) as string,
        currentServicePartNumber: (v.substitutionPartNumber || v.partNumber || v.number) as string,
        availability: (v.availability || (v.inStock ? "In Stock" : "Check Availability")) as string,
        replacementNote: (v.replacementNote || null) as string | null,
        price: v.price ? parseFloat(v.price) : null
      });
    }
  });

  return parts;
}


export function extractSearsResolverCandidates(payload: any) {
  return parseSearsModelSearchPayload(payload);
}

export function parseSearsModelDetailPayload(payload: any) {
  const model = parseSearsCatalogModel(payload);
  const diagrams = parseSearsCatalogDiagrams(payload);
  const parts = parseSearsCatalogParts(payload);
  
  return {
    model,
    diagrams,
    parts
  };
}
