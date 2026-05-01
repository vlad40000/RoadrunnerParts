import "server-only";

export type ProviderSourceType =
  | "oem"
  | "distributor"
  | "manual"
  | "diagram"
  | "fallback";

export type RetrievedSource = {
  sourceUrl: string;
  sourceType: ProviderSourceType;
  provider: string;
  sectionName?: string;
  sectionOriginal?: string;
  text: string;
  meta?: Record<string, unknown>;
};

export type ProviderInput = {
  brand: string | null;
  model: string | null;
};

export type SourceProvider = {
  name: string;
  priority: number;
  supports(input: ProviderInput): boolean;
  fetchSources(input: ProviderInput): Promise<RetrievedSource[]>;
};
