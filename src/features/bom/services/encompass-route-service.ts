import "server-only";
import { db } from "@/server/db";
import { encompassBrandRoutes } from "@/server/db/schema/encompass-brand-routes";
import { eq, sql } from "drizzle-orm";

const BRAND_ALIASES: Record<string, string> = {
  ge: "General Electric",
  "ge appliances": "General Electric",
  hotpoint: "General Electric",
  hisense: "Hisense",
  gorenje: "Hisense",
  asko: "Hisense",
  "asko usa": "Hisense",
  "asko appliances": "Hisense",
};

function canonicalBrand(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function normalizedKey(input: string) {
  return canonicalBrand(input)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveEncompassBrandRoute(brandName: string) {
  if (!brandName) return null;

  const normalized = canonicalBrand(brandName);
  const aliasTarget = BRAND_ALIASES[normalizedKey(normalized)];
  const candidates = aliasTarget
    ? [normalized, aliasTarget]
    : [normalized];

  for (const candidate of candidates) {
    const exact = await db
      .select()
      .from(encompassBrandRoutes)
      .where(eq(encompassBrandRoutes.brand, candidate))
      .limit(1);
    if (exact.length > 0) return exact[0];
  }

  for (const candidate of candidates) {
    const ci = await db
      .select()
      .from(encompassBrandRoutes)
      .where(sql`LOWER(${encompassBrandRoutes.brand}) = LOWER(${candidate})`)
      .limit(1);
    if (ci.length > 0) return ci[0];
  }

  // Legacy rollup fallback
  const exact = await db
    .select()
    .from(encompassBrandRoutes)
    .where(eq(encompassBrandRoutes.brand, normalized))
    .limit(1);
  if (exact.length > 0) return exact[0];

  const ci = await db
    .select()
    .from(encompassBrandRoutes)
    .where(sql`LOWER(${encompassBrandRoutes.brand}) = LOWER(${normalized})`)
    .limit(1);
  if (ci.length > 0) return ci[0];

  if (normalized.toUpperCase().includes("GE") || normalized.toUpperCase().includes("HOTPOINT")) {
    return resolveEncompassBrandRoute("General Electric");
  }
  if (
    normalized.toUpperCase().includes("HISENSE") ||
    normalized.toUpperCase().includes("GORENJE") ||
    normalized.toUpperCase().includes("ASKO")
  ) {
    return resolveEncompassBrandRoute("Hisense");
  }

  return null;
}
