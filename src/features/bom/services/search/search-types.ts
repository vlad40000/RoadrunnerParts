import "server-only";

export type SearchHit = {
  url: string;
  title: string;
  snippet?: string;
  rank?: number;
};

export type SearchAdapterInput = {
  queries: string[];
  domain: string;
  model?: string | null;
  applianceType?: string | null;
  brand?: string | null;
  brandFamily?: string | null;
  resolvedBrand?: string | null;
  maxResults?: number;
};

export type SearchAdapter = (
  input: SearchAdapterInput,
) => Promise<SearchHit[]>;
