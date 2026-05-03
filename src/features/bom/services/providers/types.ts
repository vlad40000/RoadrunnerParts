// import "server-only";

export type ProviderSourceType =
  | "oem"
  | "distributor"
  | "manual"
  | "diagram"
  | "fallback"
  | "distributor-merged-with-partselect"
  | "supplier_assembly"
  | "variant";

export type RetrievedSource = {
  sourceUrl: string;
  sourceType: ProviderSourceType;
  provider: string;
  sectionName?: string;
  text: string;
  meta?: Record<string, unknown>;
};

export type ProviderInput = {
  jobId?: string;
  brand: string | null;
  model: string | null;
  applianceType?: string | null;
};

export type SourceProvider = {
  name: string;
  priority: number;
  supports(input: ProviderInput): boolean;
  fetchSources(input: ProviderInput): Promise<RetrievedSource[]>;
};
