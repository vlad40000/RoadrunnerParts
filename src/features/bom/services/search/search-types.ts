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
  brandFamily?: string;
  model?: string;
  maxResults?: number;
};

export type SearchAdapter = (
  input: SearchAdapterInput,
) => Promise<SearchHit[]>;
