import "server-only";

import { db } from "@/server/db";
import { encompassModelUrls } from "@/server/db/schema/encompass-model-urls";
import { and, asc, eq, like } from "drizzle-orm";

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
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
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
    selected: rows[0],
    candidates: rows,
  };
}
