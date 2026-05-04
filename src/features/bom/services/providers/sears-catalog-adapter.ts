// import "server-only";

export type SearsPayloadKind =
  | "model_resolver"
  | "model_detail"
  | "internal_links_catalog"
  | "unknown";

export interface SearsCatalogPart {
  sectionName?: string;
  diagramNumber: string;
  description: string;
  originalPartNumber: string;
  currentServicePartNumber: string;
  availability: string;
  replacementNote: string | null;
  price: number | null;
  taxonomyName?: string | null;
  imageUrl?: string | null;
}

export type SearsInternalLinkKind =
  | "model"
  | "product"
  | "brand"
  | "category"
  | "top_page"
  | "unknown";

export interface SearsInternalLink {
  categoryName: string;
  keyword: string;
  url: string;
  kind: SearsInternalLinkKind;
  brand: string | null;
  modelNumber: string | null;
  applianceType: string | null;
  taxonomyLabel: string | null;
  partNumber: string | null;
}

export interface SearsInternalLinkCategory {
  name: string;
  taxonomyLabel: string | null;
  linkCount: number;
  internalLinks: SearsInternalLink[];
}

function refKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.__ref === "string") return value.__ref;
  return null;
}

function dereference(payload: any, value: any): any {
  const key = refKey(value);
  return key ? payload?.[key] ?? null : null;
}

function firstPropertyValueByPrefix(obj: any, prefix: string): any {
  if (!obj || typeof obj !== "object") return null;
  const key = Object.keys(obj).find((name) => name.startsWith(prefix));
  return key ? obj[key] : null;
}

function findModelObject(payload: any): any {
  if (!payload || typeof payload !== "object") return null;

  return Object.values(payload).find((value: any) =>
    value?.__typename === "Model" && (value.number || value.modelNumber)
  ) as any;
}

function findModelPartResult(modelObj: any): any {
  const direct = firstPropertyValueByPrefix(modelObj, "parts(");
  return direct?.__typename === "PartResultOutput" ? direct : null;
}

function findModelSchematicResult(modelObj: any): any {
  const direct = firstPropertyValueByPrefix(modelObj, "schematics(");
  return direct?.__typename === "SchematicResultOutput" ? direct : null;
}

function taxonomyNamesFor(payload: any, value: any): string[] {
  const taxonomyResult = firstPropertyValueByPrefix(value, "taxonomies(");
  const refs = Array.isArray(taxonomyResult?.taxonomies) ? taxonomyResult.taxonomies : [];

  return refs
    .map((ref: any) => dereference(payload, ref)?.name)
    .filter((name: any): name is string => typeof name === "string" && name.trim().length > 0);
}

export function classifySearsPayload(payload: any): SearsPayloadKind {
  if (!payload || typeof payload !== "object") return "unknown";
  
  const root = payload.ROOT_QUERY ?? {};

  const hasInternalLinksCatalog = Object.keys(root).some((key) =>
    key.startsWith("internalLinksWithCategories(")
  );

  // Pattern 1: Search results / Brand / Category listing
  const hasModelSearch = Object.keys(root).some((key) =>
    key.startsWith("models(")
  );

  // Pattern 2: Model Detail reference or actual model object
  const hasModelDetailRef = Object.entries(root).some(([key, value]) => {
    if (!key.startsWith("model(")) return false;
    const modelObj = dereference(payload, value);
    return !!(
      modelObj?.__typename === "Model" &&
      (modelObj.hasParts === true || findModelPartResult(modelObj) || findModelSchematicResult(modelObj))
    );
  });

  const hasConcreteModelDetail = Object.values(payload).some((value: any) =>
    value?.__typename === "Model" &&
    value?.hasParts === true &&
    !!findModelPartResult(value)
  );

  if (hasConcreteModelDetail || hasModelDetailRef) return "model_detail";
  if (hasModelSearch) return "model_resolver";
  if (hasInternalLinksCatalog) return "internal_links_catalog";
  
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
  const modelObj = findModelObject(payload);
  if (!modelObj) return null;

  const brandObj = dereference(payload, modelObj.brand);
  const taxonomyNames = taxonomyNamesFor(payload, modelObj);
  const modelPartResult = findModelPartResult(modelObj);
  
  return {
    id: modelObj.id,
    modelNumber: modelObj.number || modelObj.modelNumber,
    brand: modelObj.brand?.name || brandObj?.name || "Unknown",
    category: modelObj.category?.name || taxonomyNames.at(-1) || "Unknown",
    partCount: modelObj.partCount || modelPartResult?.totalCount || 0,
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
    if (v?.__typename === "Diagram" || v?.__typename === "Schematic") {
      diagrams.push({
        id: v.id,
        name: v.name || v.pageName || "Schematic",
        title: v.name || v.pageName || "Schematic",
        pageId: v.pageId || null,
        imageUrl: v.imageUrl || v.image || null,
        sourceUrl: null,
        partCount: v.partCount || 0
      });
    }
  });

  return diagrams;
}

export function parseSearsCatalogParts(payload: any): SearsCatalogPart[] {
  if (!payload) return [];
  const parts: SearsCatalogPart[] = [];
  const modelObj = findModelObject(payload);
  const modelPartResult = findModelPartResult(modelObj);
  const modelPartRefs = Array.isArray(modelPartResult?.parts)
    ? modelPartResult.parts.map(refKey).filter(Boolean)
    : [];
  const sourceParts = modelPartRefs.length
    ? modelPartRefs.map((key: string) => payload[key]).filter(Boolean)
    : Object.values(payload).filter((v: any) => v?.__typename === "Part");

  sourceParts.forEach((v: any) => {
    if (v?.__typename === "Part") {
      const substitutionResult = firstPropertyValueByPrefix(v, "substitutedByList(");
      const substitutedPart = Array.isArray(substitutionResult?.parts) && substitutionResult.parts.length
        ? dereference(payload, substitutionResult.parts[0])
        : null;
      const availabilityStatus =
        v.availability ||
        v.pricing?.availabilityInfo?.status ||
        (v.inStock ? "In Stock" : "Check Availability");
      const originalPartNumber = (v.partNumber || v.number) as string;
      const currentServicePartNumber =
        (v.substitutionPartNumber || substitutedPart?.partNumber || substitutedPart?.number || originalPartNumber) as string;
      const replacementNote =
        v.replacementNote ||
        (substitutedPart?.number && substitutedPart.number !== originalPartNumber
          ? `Manufacturer substitution: ${substitutedPart.number}`
          : null);
      const imageUrls = v.media?.image
        ? firstPropertyValueByPrefix(v.media.image, "urls(")
        : null;
      const taxonomyNames = taxonomyNamesFor(payload, v);

      parts.push({
        sectionName: (v.contextSchematicTitle || "All Model Parts") as string,
        diagramNumber: (v.keyNumber || v.diagramNumber || v.contextSchematicKeyId || "0") as string,
        description: (v.description || v.title || v.name || "Appliance Part") as string,
        originalPartNumber,
        currentServicePartNumber,
        availability: availabilityStatus as string,
        replacementNote: replacementNote as string | null,
        price: typeof v.pricing?.sell === "number"
          ? v.pricing.sell
          : v.price
            ? parseFloat(v.price)
            : null,
        taxonomyName: taxonomyNames.at(-1) || null,
        imageUrl: Array.isArray(imageUrls) ? imageUrls[0] || null : null,
      });
    }
  });

  return parts.filter((part, index, self) =>
    self.findIndex((candidate) =>
      [
        candidate.sectionName || "All Model Parts",
        candidate.diagramNumber,
        candidate.originalPartNumber,
        candidate.currentServicePartNumber,
      ].join("|") === [
        part.sectionName || "All Model Parts",
        part.diagramNumber,
        part.originalPartNumber,
        part.currentServicePartNumber,
      ].join("|")
    ) === index
  );
}

function findInternalLinkCategories(payload: any): any[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload.ROOT_QUERY ?? {};
  const categoriesKey = Object.keys(root).find((key) =>
    key.startsWith("internalLinksWithCategories(")
  );

  const categories = categoriesKey ? root[categoriesKey] : null;
  return Array.isArray(categories) ? categories : [];
}

function classifyInternalLink(url: string): SearsInternalLinkKind {
  if (/^\/model\//i.test(url)) return "model";
  if (/^\/product\//i.test(url)) return "product";
  if (/^\/brand\//i.test(url)) return "brand";
  if (/^\/category\//i.test(url)) return "category";
  if (url === "//" || url === "/") return "top_page";
  return "unknown";
}

function normalizeCatalogTaxonomyLabel(categoryName: string): string | null {
  const label = String(categoryName || "").trim();
  const s = label.toLowerCase();
  if (!s || s === "parts" || s === "top pages") return null;
  if (s.includes("refrigerator")) return "refrigerator";
  if (s.includes("microwave")) return "microwave";
  if (s.includes("dishwasher")) return "dishwasher";
  if (s.includes("range")) return "range";
  if (s.includes("oven")) return "oven";
  if (s.includes("washer")) return "washer";
  if (s.includes("dryer")) return "dryer";
  if (s.includes("water heater")) return "water_heater";
  if (s.includes("mower") || s.includes("leaf blower")) return "outdoor_power";
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function extractPartNumberFromKeyword(keyword: string): string | null {
  const tokens = String(keyword || "").match(/\b[A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*\b/g);
  return tokens?.at(-1)?.toUpperCase() ?? null;
}

function parseModelInternalLink(input: {
  categoryName: string;
  keyword: string;
  taxonomyLabel: string | null;
}) {
  const categoryWords = input.categoryName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const tokens = input.keyword
    .replace(/^shop\s+/i, "")
    .replace(/\s+parts$/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  while (
    categoryWords.length > 0 &&
    tokens.length > 0 &&
    tokens[tokens.length - 1].toLowerCase() === categoryWords[categoryWords.length - 1]
  ) {
    tokens.pop();
    categoryWords.pop();
  }

  const modelNumber = tokens.pop() ?? null;
  const brand = tokens.length ? tokens.join(" ") : null;

  return {
    brand,
    modelNumber,
    applianceType: input.taxonomyLabel,
  };
}

export function parseSearsInternalLinksCatalog(payload: any): SearsInternalLinkCategory[] {
  return findInternalLinkCategories(payload).map((category: any) => {
    const categoryName = String(category?.name || "Unknown").trim() || "Unknown";
    const taxonomyLabel = normalizeCatalogTaxonomyLabel(categoryName);
    const internalLinks = Array.isArray(category?.internalLinks) ? category.internalLinks : [];

    const parsedLinks = internalLinks.map((link: any) => {
      const keyword = String(link?.keyword || "").trim();
      const url = String(link?.url || "").trim();
      const kind = classifyInternalLink(url);
      const modelMeta =
        kind === "model"
          ? parseModelInternalLink({ categoryName, keyword, taxonomyLabel })
          : { brand: null, modelNumber: null, applianceType: taxonomyLabel };

      return {
        categoryName,
        keyword,
        url,
        kind,
        brand: modelMeta.brand,
        modelNumber: modelMeta.modelNumber,
        applianceType: modelMeta.applianceType,
        taxonomyLabel,
        partNumber: kind === "product" ? extractPartNumberFromKeyword(keyword) : null,
      };
    });

    return {
      name: categoryName,
      taxonomyLabel,
      linkCount: parsedLinks.length,
      internalLinks: parsedLinks,
    };
  });
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
