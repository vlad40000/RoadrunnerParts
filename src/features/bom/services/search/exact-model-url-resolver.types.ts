import "server-only";

export type ExactModelUrlResolverInput = {
  model: string;
  brand?: string | null;
  domain: string;
  preferredQueries: string[];
};

export type ExactModelUrlResolverResult = {
  url: string;
  expectedPartsTotal?: number;
  expectedPartsSource?: string;
  expectedPartsConfidence?: number;
} | null;
