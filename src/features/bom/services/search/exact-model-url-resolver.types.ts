import "server-only";

export type ExactModelUrlResolverInput = {
  model: string;
  domain: string;
  preferredQueries: string[];
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
};

export type ExactModelUrlResolverResult = {
  url: string;
  expectedPartsTotal?: number;
  expectedPartsSource?: string;
  expectedPartsConfidence?: number;
} | null;
