import "server-only";

import { db } from "@/server/db";
import { encompassModelUrls } from "@/server/db/schema/encompass-model-urls";
import { and, asc, eq, like, or } from "drizzle-orm";

export const ENCOMPASS_FAMILIES: Record<string, string> = {
  HOT: "GE / HotPoint tree",
  WHI: "Whirlpool tree",
  MAY: "Maytag tree",
  FRI: "Electrolux / Frigidaire tree",
  ZEN: "LG tree",
};

export type EncompassModelIndexRow = {
  brand?: string | null;
  encompass_route?: string;
  encompass_id: string;
  model_number: string;
  encoded_model_number: string;
  url: string;
};

export function normalizeModelKey(value: string) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function findEncompassModelUrl(rows: EncompassModelIndexRow[], model: string) {
  const key = normalizeModelKey(model);

  return (
    rows.find((row) => {
      return (
        normalizeModelKey(row.model_number) === key ||
        normalizeModelKey(row.encoded_model_number) === key
      );
    }) ?? null
  );
}

export async function resolveEncompassExplodedViewUrl(input: {
  model: string;
  routeHint?: string | null;
}) {
  const normalizedModel = normalizeModelKey(input.model);

  if (!normalizedModel) {
    throw new Error("Encompass resolver blocked: model is required.");
  }

  const routeHint = normalizeModelKey(input.routeHint || "");

  const rows = await db
    .select({
      brand: encompassModelUrls.brand,
      encompass_route: encompassModelUrls.encompassRoute,
      encompass_id: encompassModelUrls.encompassId,
      model_number: encompassModelUrls.modelNumber,
      encoded_model_number: encompassModelUrls.encodedModelNumber,
      url: encompassModelUrls.url,
    })
    .from(encompassModelUrls)
    .where(
      routeHint
        ? and(
            eq(encompassModelUrls.normalizedModel, normalizedModel),
            eq(encompassModelUrls.encompassRoute, routeHint),
          )
        : eq(encompassModelUrls.normalizedModel, normalizedModel),
    )
    .orderBy(asc(encompassModelUrls.encompassId))
    .limit(5);

  if (!rows.length) {
    return {
      status: "not_found" as const,
      normalizedModel,
      candidates: [],
    };
  }

  return {
    status: rows.length === 1 ? ("exact_match" as const) : ("multiple_matches" as const),
    normalizedModel,
    selected: {
      ...rows[0],
      url: rows[0].url.startsWith("http") ? rows[0].url : `https://encompass.com${rows[0].url.startsWith("/") ? "" : "/"}${rows[0].url}`,
      family: ENCOMPASS_FAMILIES[rows[0].encompass_route || ""] || "Unknown tree",
    },
    candidates: rows.map(r => ({
      ...r,
      url: r.url.startsWith("http") ? r.url : `https://encompass.com${r.url.startsWith("/") ? "" : "/"}${r.url}`,
      family: ENCOMPASS_FAMILIES[r.encompass_route || ""] || "Unknown tree",
    })),

  };
}
