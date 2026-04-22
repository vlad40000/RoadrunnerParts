import "server-only";

export type ExactModelUrlResolverInput = {
  model: string;
  domain: string;
  preferredQueries: string[];
};

export type ExactModelUrlResolverResult = {
  url: string;
  expectedPartsTotal?: number;
  expectedPartsSource?: string;
  expectedPartsConfidence?: number;
} | null;
