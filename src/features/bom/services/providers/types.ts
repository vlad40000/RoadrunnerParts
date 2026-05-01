import "server-only";

export type ProviderSourceType =
  | "oem"
  | "distributor"
  | "manual"
  | "diagram"
  | "fallback"
  | "seeded"
  | "distributor-merged-with-partselect";

export interface RetrievedSource {
  sourceUrl: string;
  sourceType: ProviderSourceType;
  provider: string;
  sectionName?: string;
  sectionOriginal?: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface ProviderInput {
  brand: string | null;
  model: string | null;
  applianceType?: string | null;
}

export interface SourceProvider {
  name: string;
  priority: number;
  supports(input: ProviderInput): boolean;
  fetchSources(input: ProviderInput): Promise<RetrievedSource[]>;
}
